import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import RdvStatusPill from '../components/RdvStatusPill'

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

interface CureItem {
  id: string
  clienteId: string | null
  clienteNom: string
  prestationNom: string
  seancesRestantes: number
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success'
      clients: Client[]
      rendezvous: RdvItem[]
      factures: FactureItem[]
      cures: CureItem[]
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

const DAY_MS = 24 * 60 * 60 * 1000

function daysUntilBirthday(dateNaissance: string, now: Date): number | null {
  const d = new Date(dateNaissance)
  if (Number.isNaN(d.getTime())) return null
  const today = startOfDay(now)
  let next = new Date(now.getFullYear(), d.getMonth(), d.getDate())
  next = startOfDay(next)
  if (next.getTime() < today.getTime()) {
    next = startOfDay(new Date(now.getFullYear() + 1, d.getMonth(), d.getDate()))
  }
  return Math.round((next.getTime() - today.getTime()) / DAY_MS)
}

function daysSince(iso: string, now: Date): number {
  const d = startOfDay(new Date(iso))
  return Math.round((startOfDay(now).getTime() - d.getTime()) / DAY_MS)
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
  onNavigateClients: () => void
  onNavigateFacturation: () => void
}

function DashboardView({
  onSelectClient,
  onNavigateAgenda,
  onNavigateClients,
  onNavigateFacturation,
}: DashboardViewProps) {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })

  const load = useCallback(() => {
    setState({ status: 'loading' })
    Promise.all([
      apiFetch<{ clients: Client[] }>(getToken, '/api/clients'),
      apiFetch<{ rendezvous: RdvItem[] }>(getToken, '/api/rendezvous'),
      apiFetch<{ factures: FactureItem[] }>(getToken, '/api/factures'),
      apiFetch<{ cures: CureItem[] }>(getToken, '/api/cures'),
    ])
      .then(([clientsData, rdvData, facturesData, curesData]) => {
        setState({
          status: 'success',
          clients: clientsData.clients,
          rendezvous: rdvData.rendezvous,
          factures: facturesData.factures,
          cures: curesData.cures,
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

    const activesCount = state.clients.filter((c) => c.statut === 'Régulière').length
    const nouvellesCount = state.clients.filter((c) => c.statut === 'Nouvelle').length

    return {
      totalClients: state.clients.length,
      activesCount,
      nouvellesCount,
      todayRdv,
      weekRdvCount,
      upcoming,
    }
  }, [state, now])

  const alerts = useMemo(() => {
    if (state.status !== 'success') return null

    const anniversaires = state.clients
      .filter((c) => c.dateNaissance)
      .map((c) => ({ client: c, jours: daysUntilBirthday(c.dateNaissance as string, now) }))
      .filter((x): x is { client: Client; jours: number } => x.jours !== null && x.jours <= 7)
      .sort((a, b) => a.jours - b.jours)

    const facturesImpayeesEnRetard = state.factures
      .filter((f) => !f.payee && f.date && daysSince(f.date, now) > 14)
      .sort((a, b) => daysSince(b.date as string, now) - daysSince(a.date as string, now))

    const lastRdvByClient = new Map<string, number>()
    for (const r of state.rendezvous) {
      if (!r.clienteId || !r.date) continue
      const t = new Date(r.date).getTime()
      if (Number.isNaN(t) || t > now.getTime()) continue
      const prev = lastRdvByClient.get(r.clienteId)
      if (!prev || t > prev) lastRdvByClient.set(r.clienteId, t)
    }

    const clientesARecontacter = state.clients
      .filter((c) => c.statut === 'Régulière')
      .map((c) => {
        const lastTime = lastRdvByClient.get(c.id)
        const jours = lastTime ? Math.round((now.getTime() - lastTime) / DAY_MS) : null
        return { client: c, jours }
      })
      .filter((x) => x.jours === null || x.jours > 60)
      .sort((a, b) => (b.jours ?? Infinity) - (a.jours ?? Infinity))

    const curesBientotTerminees = state.cures.filter((c) => c.seancesRestantes === 1)

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
  }, [state, now])

  return (
    <div>
      {state.status === 'loading' && <p className="text-sm text-text-muted">Chargement…</p>}
      {state.status === 'error' && <p className="text-sm text-danger">{state.message}</p>}

      {state.status === 'success' && stats && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Clientes au total" value={stats.totalClients} onClick={onNavigateClients} />
            <StatCard label="Clientes régulières" value={stats.activesCount} onClick={onNavigateClients} />
            <StatCard label="Nouvelles clientes" value={stats.nouvellesCount} onClick={onNavigateClients} />
            <StatCard label="RDV cette semaine" value={stats.weekRdvCount} onClick={onNavigateAgenda} />
          </div>

          {alerts && alerts.total > 0 && (
            <div className="bg-white border border-border rounded-2xl p-5">
              <h3 className="font-serif text-lg font-semibold text-sage-dark mb-4">
                Alertes &amp; rappels
              </h3>
              <div className="flex flex-col gap-1.5">
                {alerts.anniversaires.map(({ client, jours }) => (
                  <button
                    key={`anniv-${client.id}`}
                    onClick={() => onSelectClient(client.id)}
                    className="w-full text-left bg-gold-pale hover:bg-gold/20 transition-colors rounded-lg p-3 flex items-center justify-between gap-3"
                  >
                    <span className="text-sm font-semibold truncate">
                      🎂 {client.nomComplet}
                      <span className="text-text-muted font-normal"> — {formatDateLongue(client.dateNaissance)}</span>
                    </span>
                    <span className="text-xs font-semibold text-gold-text shrink-0">
                      {jours === 0 ? "Aujourd'hui" : jours === 1 ? 'Demain' : `Dans ${jours} jours`}
                    </span>
                  </button>
                ))}

                {alerts.facturesImpayeesEnRetard.map((f) => (
                  <button
                    key={`facture-${f.id}`}
                    onClick={onNavigateFacturation}
                    className="w-full text-left bg-danger-pale hover:bg-danger/10 transition-colors rounded-lg p-3 flex items-center justify-between gap-3"
                  >
                    <span className="text-sm font-semibold truncate">
                      💶 Facture impayée — {f.clienteNom || 'Cliente inconnue'}
                    </span>
                    <span className="text-xs font-semibold text-danger shrink-0">
                      {f.montant !== null ? `${f.montant} € — ` : ''}
                      en retard depuis {daysSince(f.date as string, now)} jours
                    </span>
                  </button>
                ))}

                {alerts.clientesARecontacter.map(({ client, jours }) => (
                  <button
                    key={`recontact-${client.id}`}
                    onClick={() => onSelectClient(client.id)}
                    className="w-full text-left bg-sage-pale hover:bg-sage-light transition-colors rounded-lg p-3 flex items-center justify-between gap-3"
                  >
                    <span className="text-sm font-semibold truncate">
                      📞 À recontacter — {client.nomComplet}
                    </span>
                    <span className="text-xs font-semibold text-sage-dark shrink-0">
                      {jours === null ? 'Aucun RDV enregistré' : `Vue il y a ${jours} jours`}
                    </span>
                  </button>
                ))}

                {alerts.curesBientotTerminees.map((c) => (
                  <button
                    key={`cure-${c.id}`}
                    onClick={() => c.clienteId && onSelectClient(c.clienteId)}
                    className="w-full text-left bg-sage-pale hover:bg-sage-light transition-colors rounded-lg p-3 flex items-center justify-between gap-3"
                  >
                    <span className="text-sm font-semibold truncate">
                      ✨ Dernière séance de cure — {c.clienteNom || 'Cliente inconnue'}
                    </span>
                    <span className="text-xs font-semibold text-sage-dark shrink-0">
                      {c.prestationNom}
                    </span>
                  </button>
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
