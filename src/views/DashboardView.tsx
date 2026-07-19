import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import RdvStatusPill from '../components/RdvStatusPill'
import AlertRow from '../components/AlertRow'
import {
  computeAnniversaires,
  computeFacturesImpayeesEnRetard,
  computeClientesARecontacter,
  computeCuresBientotTerminees,
  daysSince,
} from '../lib/alerts'
import { computeCureProgress } from '../lib/cureProgress'
import { getDismissedSet, dismissAlert } from '../lib/dismissedAlerts'

interface Client {
  id: string
  nomComplet: string
  statut: string
  newsletter: boolean
  dateNaissance: string | null
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
  onClick?: () => void
}

function StatCard({ label, value, onClick }: StatCardProps) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={`bg-white border border-border rounded-2xl p-5 text-left ${onClick ? 'hover:border-sage-dark transition-colors cursor-pointer' : ''}`}
    >
      <div className="text-xs font-semibold text-text-muted uppercase tracking-wide">{label}</div>
      <div className="font-serif text-3xl font-semibold text-sage-dark mt-1.5">{value}</div>
    </Comp>
  )
}

interface DashboardViewProps {
  onSelectClient: (id: string) => void
  onNavigateAgenda: () => void
  onNavigateFacturation: () => void
}

function DashboardView({
  onSelectClient,
  onNavigateAgenda,
  onNavigateFacturation,
}: DashboardViewProps) {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [dismissed, setDismissed] = useState<Set<string>>(() => getDismissedSet())

  const load = useCallback(() => {
    setState({ status: 'loading' })
    Promise.all([
      apiFetch<{ clients: Client[] }>(getToken, '/api/clients'),
      apiFetch<{ rendezvous: RdvItem[] }>(getToken, '/api/rendezvous'),
      apiFetch<{ factures: FactureItem[] }>(getToken, '/api/factures'),
      apiFetch<{ prestations: Prestation[] }>(getToken, '/api/prestations'),
    ])
      .then(([clientsData, rdvData, facturesData, prestationsData]) => {
        setState({
          status: 'success',
          clients: clientsData.clients,
          rendezvous: rdvData.rendezvous,
          factures: facturesData.factures,
          prestations: prestationsData.prestations,
        })
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

  function handleDismiss(key: string) {
    dismissAlert(key)
    setDismissed(getDismissedSet())
  }

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

    return {
      todayCount: todayRdv.length,
      weekRdvCount,
      caCeMois,
      facturesImpayeesCount,
      todayRdv,
      upcoming,
    }
  }, [state, now])

  const alerts = useMemo(() => {
    if (state.status !== 'success') return null

    const cureProgress = computeCureProgress(state.rendezvous, state.prestations)

    const anniversaires = computeAnniversaires(state.clients, now).filter(
      ({ client }) => !dismissed.has(`anniv-${client.id}-${now.getFullYear()}`),
    )
    const facturesImpayeesEnRetard = computeFacturesImpayeesEnRetard(state.factures, now).filter(
      (f) => !dismissed.has(`facture-${f.id}`),
    )
    const clientesARecontacter = computeClientesARecontacter(state.clients, state.rendezvous, now).filter(
      ({ client }) => !dismissed.has(`recontact-${client.id}`),
    )
    const curesBientotTerminees = computeCuresBientotTerminees(cureProgress).filter(
      (c) => !dismissed.has(`cure-${c.id}`),
    )

    return {
      anniversaires,
      facturesImpayeesEnRetard,
      clientesARecontacter,
      curesBientotTerminees,
      total:
        anniversaires.length +
        facturesImpayeesEnRetard.length +
        clientesARecontacter.length +
        curesBientotTerminees.length,
    }
  }, [state, now, dismissed])

  return (
    <div>
      {state.status === 'loading' && <p className="text-sm text-text-muted">Chargement…</p>}
      {state.status === 'error' && <p className="text-sm text-danger">{state.message}</p>}

      {state.status === 'success' && stats && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="RDV aujourd'hui" value={stats.todayCount} onClick={onNavigateAgenda} />
            <StatCard label="RDV cette semaine" value={stats.weekRdvCount} onClick={onNavigateAgenda} />
            <StatCard label="Chiffre d'affaires ce mois-ci" value={formatEuros(stats.caCeMois)} onClick={onNavigateFacturation} />
            <StatCard label="Factures impayées" value={stats.facturesImpayeesCount} onClick={onNavigateFacturation} />
          </div>

          {alerts && alerts.total > 0 && (
            <div className="bg-white border border-border rounded-2xl p-5">
              <h3 className="font-serif text-lg font-semibold text-sage-dark mb-4">
                Alertes &amp; rappels
              </h3>
              <div className="flex flex-col gap-1.5">
                {alerts.anniversaires.map(({ client, jours }) => (
                  <AlertRow
                    key={`anniv-${client.id}`}
                    colorClass="bg-gold-pale hover:bg-gold/20 transition-colors"
                    subtitleClassName="text-gold-text"
                    onClick={() => onSelectClient(client.id)}
                    onDismiss={() => handleDismiss(`anniv-${client.id}-${now.getFullYear()}`)}
                    title={
                      <>
                        🎂 {client.nomComplet}
                        <span className="text-text-muted font-normal"> — {formatDateLongue(client.dateNaissance)}</span>
                      </>
                    }
                    subtitle={jours === 0 ? "Aujourd'hui" : jours === 1 ? 'Demain' : `Dans ${jours} jours`}
                  />
                ))}

                {alerts.facturesImpayeesEnRetard.map((f) => (
                  <AlertRow
                    key={`facture-${f.id}`}
                    colorClass="bg-danger-pale hover:bg-danger/10 transition-colors"
                    subtitleClassName="text-danger"
                    onClick={onNavigateFacturation}
                    onDismiss={() => handleDismiss(`facture-${f.id}`)}
                    title={`💶 Facture impayée — ${f.clienteNom || 'Cliente inconnue'}`}
                    subtitle={`${f.montant !== null ? `${f.montant} € — ` : ''}en retard depuis ${daysSince(f.date as string, now)} jours`}
                  />
                ))}

                {alerts.clientesARecontacter.map(({ client, jours }) => (
                  <AlertRow
                    key={`recontact-${client.id}`}
                    colorClass="bg-sage-pale hover:bg-sage-light transition-colors"
                    subtitleClassName="text-sage-dark"
                    onClick={() => onSelectClient(client.id)}
                    onDismiss={() => handleDismiss(`recontact-${client.id}`)}
                    title={`📞 À recontacter — ${client.nomComplet}`}
                    subtitle={jours === null ? 'Aucun RDV enregistré' : `Vue il y a ${jours} jours`}
                  />
                ))}

                {alerts.curesBientotTerminees.map((c) => (
                  <AlertRow
                    key={`cure-${c.id}`}
                    colorClass="bg-sage-pale hover:bg-sage-light transition-colors"
                    subtitleClassName="text-sage-dark"
                    onClick={() => onSelectClient(c.clienteId)}
                    onDismiss={() => handleDismiss(`cure-${c.id}`)}
                    title={`✨ Dernière séance de cure — ${c.clienteNom || 'Cliente inconnue'}`}
                    subtitle={c.prestationNom}
                  />
                ))}
              </div>
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
                      className="w-full text-left bg-sage-pale hover:bg-sage-light transition-colors rounded-lg p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{item.clienteNom || 'Cliente inconnue'}</div>
                        <div className="text-xs text-text-muted truncate">
                          {item.prestationNom || 'Prestation inconnue'}
                          {item.prix !== null ? ` — ${item.prix} €` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-semibold text-sage-dark">{formatHeure(item.date)}</span>
                        <RdvStatusPill statut={item.statut} />
                      </div>
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
                      className="w-full text-left bg-sage-pale hover:bg-sage-light transition-colors rounded-lg p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
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
        </div>
      )}
    </div>
  )
}

export default DashboardView
