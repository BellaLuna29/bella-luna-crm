import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import RdvStatusPill from '../components/RdvStatusPill'
import AlertRow from '../components/AlertRow'
import Icon, { type IconName } from '../components/Icon'
import {
  computeAnniversaires,
  computeFacturesImpayeesEnRetard,
  computeClientesARecontacter,
  computeCuresBientotTerminees,
  daysSince,
} from '../lib/alerts'
import { computeCureProgress } from '../lib/cureProgress'
import {
  type DismissedAlert,
  fetchDismissedAlerts,
  dismissAlertKey,
  reconcileDismissedAlerts,
} from '../lib/dismissedAlerts'
import { fetchParametres } from '../lib/parametres'
import { avatarColorClass } from '../lib/avatarColor'

const VISIBLE_ALERTS_COUNT = 4

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

interface Client {
  id: string
  nomComplet: string
  statut: string
  newsletter: boolean
  dateNaissance: string | null
}

interface StockItem {
  id: string
  nom: string
  quantite: number
  seuilBas: number
}

interface RdvItem {
  id: string
  date: string | null
  statut: string
  clienteId: string | null
  clienteNom: string
  prestationId: string | null
  prestationNom: string
  prix: number | null
}

interface FactureItem {
  id: string
  date: string | null
  montant: number | null
  payee: boolean
  clienteId: string | null
  clienteNom: string
}

interface Prestation {
  id: string
  type: string
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success'
      clients: Client[]
      rendezvous: RdvItem[]
      factures: FactureItem[]
      prestations: Prestation[]
      stock: StockItem[]
      objectifCaMensuel: number | null
    }

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function endOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(23, 59, 59, 999)
  return copy
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

function startOfWeek(d: Date): Date {
  const copy = startOfDay(d)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  return copy
}

function endOfWeek(d: Date): Date {
  const copy = startOfWeek(d)
  copy.setDate(copy.getDate() + 6)
  return endOfDay(copy)
}

function formatHeure(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function formatDateCourte(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatDateLongue(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

function formatEuros(n: number): string {
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

interface StatCardProps {
  label: string
  value: string | number
  icon: IconName
  iconClass: string
  onClick?: () => void
}

function StatCard({ label, value, icon, iconClass, onClick }: StatCardProps) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={`bg-white border border-border rounded-2xl p-5 text-left flex items-start justify-between gap-3 ${onClick ? 'hover:border-sage-dark hover:shadow-sm transition-all cursor-pointer' : ''}`}
    >
      <div>
        <div className="text-xs font-semibold text-text-muted uppercase tracking-wide">{label}</div>
        <div className="font-serif text-3xl font-semibold text-sage-dark mt-1.5">{value}</div>
      </div>
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
        <Icon name={icon} size={19} />
      </span>
    </Comp>
  )
}

interface DashboardViewProps {
  onSelectClient: (id: string) => void
  onNavigateAgenda: () => void
  onNavigateFacturation: () => void
  onNavigateCompta: () => void
  onNavigateParametres: () => void
}

function DashboardView({
  onSelectClient,
  onNavigateAgenda,
  onNavigateFacturation,
  onNavigateCompta,
  onNavigateParametres,
}: DashboardViewProps) {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [dismissedRaw, setDismissedRaw] = useState<DismissedAlert[]>([])
  const [validDismissedKeys, setValidDismissedKeys] = useState<Set<string>>(new Set())
  const [dismissError, setDismissError] = useState<string | null>(null)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    Promise.all([
      apiFetch<{ clients: Client[] }>(getToken, '/api/clients'),
      apiFetch<{ rendezvous: RdvItem[] }>(getToken, '/api/rendezvous'),
      apiFetch<{ factures: FactureItem[] }>(getToken, '/api/factures'),
      apiFetch<{ prestations: Prestation[] }>(getToken, '/api/prestations'),
      apiFetch<{ stock: StockItem[] }>(getToken, '/api/prestations?resource=stock').catch(() => ({ stock: [] })),
      fetchParametres(getToken).catch(() => ({ horaires: {}, objectifCaMensuel: null })),
      fetchDismissedAlerts(getToken).catch(() => []),
    ])
      .then(([clientsData, rdvData, facturesData, prestationsData, stockData, parametresData, dismissedData]) => {
        setState({
          status: 'success',
          clients: clientsData.clients,
          rendezvous: rdvData.rendezvous,
          factures: facturesData.factures,
          prestations: prestationsData.prestations,
          stock: stockData.stock,
          objectifCaMensuel: parametresData.objectifCaMensuel,
        })
        setDismissedRaw(dismissedData)
      })
      .catch((error: unknown) => {
        setState({
          status: 'error',
          message: error instanceof ApiError ? error.message : 'Erreur inconnue.',
        })
      })
  }, [getToken])

  useEffect(() => {
    load()
  }, [load])

  const now = useMemo(() => new Date(), [])

  const stats = useMemo(() => {
    if (state.status !== 'success') return null

    const todayStart = startOfDay(now)
    const todayEnd = endOfDay(now)
    const weekStart = startOfWeek(now)
    const weekEnd = endOfWeek(now)

    const validRdv = state.rendezvous.filter((r) => r.date && !Number.isNaN(new Date(r.date).getTime()))

    const todayRdv = validRdv
      .filter((r) => {
        const d = new Date(r.date as string)
        return d >= todayStart && d <= todayEnd
      })
      .sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime())

    const weekRdvCount = validRdv.filter((r) => {
      const d = new Date(r.date as string)
      return d >= weekStart && d <= weekEnd
    }).length

    const upcoming = validRdv
      .filter((r) => new Date(r.date as string).getTime() > now.getTime())
      .sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime())
      .slice(0, 5)

    const caCeMois = state.factures
      .filter((f) => {
        if (!f.date) return false
        const d = new Date(f.date)
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      })
      .reduce((sum, f) => sum + (f.montant ?? 0), 0)

    const facturesImpayeesCount = state.factures.filter((f) => !f.payee).length

    const weeklyChart = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(todayStart, i - 6)
      const dayStart = startOfDay(day)
      const dayEnd = endOfDay(day)
      const total = state.factures
        .filter((f) => {
          if (!f.date) return false
          const d = new Date(f.date)
          return d >= dayStart && d <= dayEnd
        })
        .reduce((sum, f) => sum + (f.montant ?? 0), 0)
      return { label: day.toLocaleDateString('fr-FR', { weekday: 'short' }), total }
    })
    const weeklyChartMax = Math.max(1, ...weeklyChart.map((d) => d.total))

    return {
      todayCount: todayRdv.length,
      weekRdvCount,
      caCeMois,
      facturesImpayeesCount,
      todayRdv,
      upcoming,
      weeklyChart,
      weeklyChartMax,
    }
  }, [state, now])

  const rawAlerts = useMemo(() => {
    if (state.status !== 'success') return null
    const cureProgress = computeCureProgress(state.rendezvous, state.prestations)
    const stockBas = state.stock.filter((s) => s.quantite <= s.seuilBas)
    const objectifAtteint =
      state.objectifCaMensuel !== null && state.objectifCaMensuel > 0 && (stats?.caCeMois ?? 0) >= state.objectifCaMensuel
    return {
      anniversaires: computeAnniversaires(state.clients, now),
      facturesImpayeesEnRetard: computeFacturesImpayeesEnRetard(state.factures, now),
      clientesARecontacter: computeClientesARecontacter(state.clients, state.rendezvous, now),
      curesBientotTerminees: computeCuresBientotTerminees(cureProgress),
      stockBas,
      objectifAtteint,
    }
  }, [state, now, stats])

  useEffect(() => {
    if (!rawAlerts) return
    const keys = new Set<string>()
    for (const { client } of rawAlerts.anniversaires) keys.add(`anniv-${client.id}-${now.getFullYear()}`)
    for (const f of rawAlerts.facturesImpayeesEnRetard) keys.add(`facture-${f.id}`)
    for (const { client } of rawAlerts.clientesARecontacter) keys.add(`recontact-${client.id}`)
    for (const c of rawAlerts.curesBientotTerminees) keys.add(`cure-${c.id}`)
    for (const s of rawAlerts.stockBas) keys.add(`stock-${s.id}`)
    if (rawAlerts.objectifAtteint) keys.add(`objectif-${now.getFullYear()}-${now.getMonth()}`)
    reconcileDismissedAlerts(getToken, dismissedRaw, keys).then(setValidDismissedKeys)
  }, [rawAlerts, dismissedRaw, getToken, now])

  async function handleDismiss(key: string) {
    setValidDismissedKeys((prev) => new Set(prev).add(key))
    setDismissError(null)
    try {
      await dismissAlertKey(getToken, key)
      setDismissedRaw(await fetchDismissedAlerts(getToken))
    } catch (err) {
      setDismissError(
        err instanceof ApiError
          ? err.message
          : "Impossible d'enregistrer sur tous tes appareils, mais l'alerte reste masquée ici.",
      )
    }
  }

  const alerts = useMemo(() => {
    if (!rawAlerts) return null

    const anniversaires = rawAlerts.anniversaires.filter(
      ({ client }) => !validDismissedKeys.has(`anniv-${client.id}-${now.getFullYear()}`),
    )
    const facturesImpayeesEnRetard = rawAlerts.facturesImpayeesEnRetard.filter(
      (f) => !validDismissedKeys.has(`facture-${f.id}`),
    )
    const clientesARecontacter = rawAlerts.clientesARecontacter.filter(
      ({ client }) => !validDismissedKeys.has(`recontact-${client.id}`),
    )
    const curesBientotTerminees = rawAlerts.curesBientotTerminees.filter(
      (c) => !validDismissedKeys.has(`cure-${c.id}`),
    )
    const stockBas = rawAlerts.stockBas.filter((s) => !validDismissedKeys.has(`stock-${s.id}`))
    const objectifAtteint =
      rawAlerts.objectifAtteint && !validDismissedKeys.has(`objectif-${now.getFullYear()}-${now.getMonth()}`)

    return {
      anniversaires,
      facturesImpayeesEnRetard,
      clientesARecontacter,
      curesBientotTerminees,
      stockBas,
      objectifAtteint,
      total:
        anniversaires.length +
        facturesImpayeesEnRetard.length +
        clientesARecontacter.length +
        curesBientotTerminees.length +
        stockBas.length +
        (objectifAtteint ? 1 : 0),
    }
  }, [rawAlerts, validDismissedKeys, now])

  const alertItems = useMemo(() => {
    if (!alerts || !stats) return []
    const items: Array<{
      key: string
      colorClass: string
      subtitleClassName: string
      icon: IconName
      iconClass: string
      title: ReactNode
      subtitle: ReactNode
      onClick?: () => void
      dismissKey: string
    }> = []

    for (const { client, jours } of alerts.anniversaires) {
      items.push({
        key: `anniv-${client.id}`,
        colorClass: 'bg-gold-pale hover:bg-gold/20 transition-colors',
        subtitleClassName: 'text-gold-text',
        icon: 'cake',
        iconClass: 'bg-gold/25 text-gold-text',
        title: (
          <>
            {client.nomComplet}
            <span className="text-text-muted font-normal"> — {formatDateLongue(client.dateNaissance)}</span>
          </>
        ),
        subtitle: jours === 0 ? "Aujourd'hui" : jours === 1 ? 'Demain' : `Dans ${jours} jours`,
        onClick: () => onSelectClient(client.id),
        dismissKey: `anniv-${client.id}-${now.getFullYear()}`,
      })
    }

    for (const f of alerts.facturesImpayeesEnRetard) {
      items.push({
        key: `facture-${f.id}`,
        colorClass: 'bg-danger-pale hover:bg-danger/10 transition-colors',
        subtitleClassName: 'text-danger',
        icon: 'receipt',
        iconClass: 'bg-danger/20 text-danger',
        title: `Facture impayée — ${f.clienteNom || 'Cliente inconnue'}`,
        subtitle: `${f.montant !== null ? `${f.montant} € — ` : ''}en retard depuis ${daysSince(f.date as string, now)} jours`,
        onClick: onNavigateFacturation,
        dismissKey: `facture-${f.id}`,
      })
    }

    for (const { client, jours } of alerts.clientesARecontacter) {
      items.push({
        key: `recontact-${client.id}`,
        colorClass: 'bg-sage-pale hover:bg-sage-light transition-colors',
        subtitleClassName: 'text-sage-dark',
        icon: 'phone',
        iconClass: 'bg-sage/20 text-sage-dark',
        title: `À recontacter — ${client.nomComplet}`,
        subtitle: jours === null ? 'Aucun rendez-vous enregistré' : `Vue il y a ${jours} jours`,
        onClick: () => onSelectClient(client.id),
        dismissKey: `recontact-${client.id}`,
      })
    }

    for (const c of alerts.curesBientotTerminees) {
      items.push({
        key: `cure-${c.id}`,
        colorClass: 'bg-sage-pale hover:bg-sage-light transition-colors',
        subtitleClassName: 'text-sage-dark',
        icon: 'sparkles',
        iconClass: 'bg-avatar-teal/20 text-avatar-teal',
        title: `Dernière séance de cure — ${c.clienteNom || 'Cliente inconnue'}`,
        subtitle: c.prestationNom,
        onClick: () => onSelectClient(c.clienteId),
        dismissKey: `cure-${c.id}`,
      })
    }

    for (const s of alerts.stockBas) {
      items.push({
        key: `stock-${s.id}`,
        colorClass: 'bg-danger-pale hover:bg-danger/10 transition-colors',
        subtitleClassName: 'text-danger',
        icon: 'package',
        iconClass: 'bg-danger/20 text-danger',
        title: `Stock bas — ${s.nom}`,
        subtitle: `${s.quantite} restant${s.quantite > 1 ? 's' : ''}`,
        onClick: onNavigateCompta,
        dismissKey: `stock-${s.id}`,
      })
    }

    if (alerts.objectifAtteint) {
      items.push({
        key: 'objectif',
        colorClass: 'bg-gold-pale hover:bg-gold/20 transition-colors',
        subtitleClassName: 'text-gold-text',
        icon: 'target',
        iconClass: 'bg-gold/25 text-gold-text',
        title: 'Objectif de CA mensuel atteint',
        subtitle: formatEuros(stats.caCeMois),
        dismissKey: `objectif-${now.getFullYear()}-${now.getMonth()}`,
      })
    }

    return items
  }, [alerts, stats, now, onSelectClient, onNavigateFacturation, onNavigateCompta])

  return (
    <div>
      {state.status === 'loading' && <p className="text-sm text-text-muted">Chargement…</p>}
      {state.status === 'error' && <p className="text-sm text-danger">{state.message}</p>}

      {state.status === 'success' && stats && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="RDV aujourd'hui"
              value={stats.todayCount}
              icon="calendar"
              iconClass="bg-avatar-teal/20 text-avatar-teal"
              onClick={onNavigateAgenda}
            />
            <StatCard
              label="RDV cette semaine"
              value={stats.weekRdvCount}
              icon="calendar"
              iconClass="bg-avatar-indigo/20 text-avatar-indigo"
              onClick={onNavigateAgenda}
            />
            <StatCard
              label="Chiffre d'affaires ce mois-ci"
              value={formatEuros(stats.caCeMois)}
              icon="trending-up"
              iconClass="bg-sage/20 text-sage-dark"
              onClick={onNavigateFacturation}
            />
            <StatCard
              label="Factures impayées"
              value={stats.facturesImpayeesCount}
              icon="receipt"
              iconClass="bg-danger/20 text-danger"
              onClick={onNavigateFacturation}
            />
          </div>

          {alerts && alerts.total > 0 && (
            <div className="bg-white border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif text-lg font-semibold text-sage-dark">
                  Alertes &amp; rappels <span className="text-text-muted font-sans text-sm font-normal">({alerts.total})</span>
                </h3>
                <button onClick={onNavigateParametres} className="text-xs font-semibold text-sage-dark hover:underline shrink-0">
                  Voir tout
                </button>
              </div>
              {dismissError && <p className="text-sm text-danger mb-3">{dismissError}</p>}
              <div className="flex flex-col gap-1.5">
                {alertItems.slice(0, VISIBLE_ALERTS_COUNT).map((item) => (
                  <AlertRow
                    key={item.key}
                    colorClass={item.colorClass}
                    subtitleClassName={item.subtitleClassName}
                    icon={item.icon}
                    iconClass={item.iconClass}
                    onClick={item.onClick}
                    onDismiss={() => handleDismiss(item.dismissKey)}
                    title={item.title}
                    subtitle={item.subtitle}
                  />
                ))}
              </div>
              {alertItems.length > VISIBLE_ALERTS_COUNT && (
                <button
                  onClick={onNavigateParametres}
                  className="mt-3 text-xs font-semibold text-sage-dark hover:underline"
                >
                  + {alertItems.length - VISIBLE_ALERTS_COUNT} autre{alertItems.length - VISIBLE_ALERTS_COUNT > 1 ? 's' : ''} dans Paramètres
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif text-lg font-semibold text-sage-dark">Aujourd'hui</h3>
                <button
                  onClick={onNavigateAgenda}
                  className="text-xs font-semibold text-sage-dark hover:underline"
                >
                  Voir l'agenda
                </button>
              </div>
              {stats.todayRdv.length === 0 ? (
                <p className="text-sm text-text-muted">Aucun rendez-vous aujourd'hui.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {stats.todayRdv.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => item.clienteId && onSelectClient(item.clienteId)}
                      className="w-full text-left bg-sage-pale hover:bg-sage-light transition-colors rounded-lg p-3 flex items-center gap-3"
                    >
                      <div className="font-serif text-sm font-semibold text-sage-dark w-12 shrink-0 text-center">
                        {formatHeure(item.date)}
                      </div>
                      <div
                        className={`w-9 h-9 rounded-full text-white flex items-center justify-center font-semibold text-xs shrink-0 ${avatarColorClass(item.clienteNom || item.id)}`}
                      >
                        {initials(item.clienteNom || '?')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{item.clienteNom || 'Cliente inconnue'}</div>
                        <div className="text-xs text-text-muted truncate">
                          {item.prestationNom || 'Prestation inconnue'}
                          {item.prix !== null ? ` — ${item.prix} €` : ''}
                        </div>
                      </div>
                      <RdvStatusPill statut={item.statut} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-serif text-lg font-semibold text-sage-dark">Prochains rendez-vous</h3>
                <button
                  onClick={onNavigateAgenda}
                  className="text-xs font-semibold text-sage-dark hover:underline"
                >
                  Voir l'agenda
                </button>
              </div>
              {stats.upcoming.length === 0 ? (
                <p className="text-sm text-text-muted">Aucun rendez-vous à venir.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {stats.upcoming.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => item.clienteId && onSelectClient(item.clienteId)}
                      className="w-full text-left bg-sage-pale hover:bg-sage-light transition-colors rounded-lg p-3 flex items-center gap-3"
                    >
                      <div
                        className={`w-9 h-9 rounded-full text-white flex items-center justify-center font-semibold text-xs shrink-0 ${avatarColorClass(item.clienteNom || item.id)}`}
                      >
                        {initials(item.clienteNom || '?')}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{item.clienteNom || 'Cliente inconnue'}</div>
                        <div className="text-xs text-text-muted truncate">
                          {item.prestationNom || 'Prestation inconnue'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-semibold text-sage-dark capitalize">
                          {formatDateCourte(item.date)} — {formatHeure(item.date)}
                        </span>
                        <RdvStatusPill statut={item.statut} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-avatar-teal/20 text-avatar-teal">
                <Icon name="trending-up" size={16} />
              </span>
              <h3 className="font-serif text-lg font-semibold text-sage-dark">
                Chiffre d'affaires — 7 derniers jours
              </h3>
            </div>
            <div className="flex items-end gap-3 h-40">
              {stats.weeklyChart.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className="text-xs font-semibold text-text-muted">
                    {d.total > 0 ? formatEuros(d.total) : ''}
                  </span>
                  <div
                    className={`w-full rounded-t-md ${i === 6 ? 'bg-avatar-teal' : 'bg-avatar-teal/25'}`}
                    style={{ height: `${Math.max(4, (d.total / stats.weeklyChartMax) * 100)}%` }}
                  />
                  <span className="text-xs text-text-muted capitalize">{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DashboardView
