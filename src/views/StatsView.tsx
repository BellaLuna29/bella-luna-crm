import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'

interface Client {
  id: string
  statut: string
  dateCreation: string | null
}

interface RdvItem {
  id: string
  date: string | null
  statut: string
  prestationNom: string
  prix: number | null
}

interface FactureItem {
  id: string
  date: string | null
  montant: number | null
}

interface DepenseItem {
  id: string
  date: string | null
  montant: number | null
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success'
      clients: Client[]
      rendezvous: RdvItem[]
      factures: FactureItem[]
      depenses: DepenseItem[]
    }

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function isInMonth(iso: string | null, monthStart: Date): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  return d.getFullYear() === monthStart.getFullYear() && d.getMonth() === monthStart.getMonth()
}

function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function formatEuros(n: number): string {
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

interface ComparisonCardProps {
  label: string
  current: number
  previous: number
  formatValue?: (n: number) => string
  positiveIsGood?: boolean
}

function ComparisonCard({
  label,
  current,
  previous,
  formatValue = (n) => String(n),
  positiveIsGood = true,
}: ComparisonCardProps) {
  const delta = current - previous
  const pct = previous !== 0 ? Math.round((delta / previous) * 100) : current > 0 ? 100 : 0
  const isGood = positiveIsGood ? delta >= 0 : delta <= 0
  const deltaColor = delta === 0 ? 'text-text-muted' : isGood ? 'text-sage-dark' : 'text-danger'

  return (
    <div className="bg-white border border-border rounded-2xl p-5">
      <div className="text-xs font-semibold text-text-muted uppercase tracking-wide">{label}</div>
      <div className="font-serif text-3xl font-semibold text-sage-dark mt-1.5">
        {formatValue(current)}
      </div>
      <div className={`text-xs font-semibold mt-1.5 ${deltaColor}`}>
        {delta >= 0 ? '▲' : '▼'} {Math.abs(pct)} % vs mois précédent ({formatValue(previous)})
      </div>
    </div>
  )
}

function StatsView() {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })

  const load = useCallback(() => {
    setState({ status: 'loading' })
    Promise.all([
      apiFetch<{ clients: Client[] }>(getToken, '/api/clients'),
      apiFetch<{ rendezvous: RdvItem[] }>(getToken, '/api/rendezvous'),
      apiFetch<{ factures: FactureItem[] }>(getToken, '/api/factures'),
      apiFetch<{ depenses: DepenseItem[] }>(getToken, '/api/depenses'),
    ])
      .then(([clientsData, rdvData, facturesData, depensesData]) => {
        setState({
          status: 'success',
          clients: clientsData.clients,
          rendezvous: rdvData.rendezvous,
          factures: facturesData.factures,
          depenses: depensesData.depenses,
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
  const thisMonth = useMemo(() => startOfMonth(now), [now])
  const lastMonth = useMemo(() => new Date(thisMonth.getFullYear(), thisMonth.getMonth() - 1, 1), [thisMonth])

  const data = useMemo(() => {
    if (state.status !== 'success') return null

    const sumFactures = (monthStart: Date) =>
      state.factures
        .filter((f) => isInMonth(f.date, monthStart))
        .reduce((sum, f) => sum + (f.montant ?? 0), 0)

    const sumDepenses = (monthStart: Date) =>
      state.depenses
        .filter((d) => isInMonth(d.date, monthStart))
        .reduce((sum, d) => sum + (d.montant ?? 0), 0)

    const countRdv = (monthStart: Date) =>
      state.rendezvous.filter((r) => isInMonth(r.date, monthStart)).length

    const countNouvelles = (monthStart: Date) =>
      state.clients.filter((c) => isInMonth(c.dateCreation, monthStart)).length

    const caThisMonth = sumFactures(thisMonth)
    const caLastMonth = sumFactures(lastMonth)
    const depensesThisMonth = sumDepenses(thisMonth)
    const depensesLastMonth = sumDepenses(lastMonth)

    const prestationStats = new Map<string, { count: number; ca: number }>()
    for (const r of state.rendezvous) {
      if (!isInMonth(r.date, thisMonth)) continue
      const nom = r.prestationNom || 'Prestation inconnue'
      const entry = prestationStats.get(nom) ?? { count: 0, ca: 0 }
      entry.count += 1
      entry.ca += r.prix ?? 0
      prestationStats.set(nom, entry)
    }
    const topPrestations = Array.from(prestationStats.entries())
      .map(([nom, v]) => ({ nom, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      caThisMonth,
      caLastMonth,
      depensesThisMonth,
      depensesLastMonth,
      resultatThisMonth: caThisMonth - depensesThisMonth,
      resultatLastMonth: caLastMonth - depensesLastMonth,
      rdvThisMonth: countRdv(thisMonth),
      rdvLastMonth: countRdv(lastMonth),
      nouvellesThisMonth: countNouvelles(thisMonth),
      nouvellesLastMonth: countNouvelles(lastMonth),
      topPrestations,
    }
  }, [state, thisMonth, lastMonth])

  return (
    <div>
      {state.status === 'loading' && <p className="text-sm text-text-muted">Chargement…</p>}
      {state.status === 'error' && <p className="text-sm text-danger">{state.message}</p>}

      {state.status === 'success' && data && (
        <div className="flex flex-col gap-6">
          <p className="text-sm text-text-muted -mt-1">
            Comparaison <span className="font-semibold capitalize">{formatMonthLabel(thisMonth)}</span> vs{' '}
            <span className="font-semibold capitalize">{formatMonthLabel(lastMonth)}</span>
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <ComparisonCard
              label="Chiffre d'affaires facturé"
              current={data.caThisMonth}
              previous={data.caLastMonth}
              formatValue={formatEuros}
            />
            <ComparisonCard
              label="Dépenses"
              current={data.depensesThisMonth}
              previous={data.depensesLastMonth}
              formatValue={formatEuros}
              positiveIsGood={false}
            />
            <ComparisonCard
              label="Résultat net"
              current={data.resultatThisMonth}
              previous={data.resultatLastMonth}
              formatValue={formatEuros}
            />
            <ComparisonCard
              label="Rendez-vous"
              current={data.rdvThisMonth}
              previous={data.rdvLastMonth}
            />
            <ComparisonCard
              label="Nouvelles clientes"
              current={data.nouvellesThisMonth}
              previous={data.nouvellesLastMonth}
            />
          </div>

          <div className="bg-white border border-border rounded-2xl p-5">
            <h3 className="font-serif text-lg font-semibold text-sage-dark mb-4">
              Prestations les plus demandées ce mois-ci
            </h3>
            {data.topPrestations.length === 0 ? (
              <p className="text-sm text-text-muted">Aucun rendez-vous ce mois-ci.</p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Prestation', 'Nombre de RDV', 'Chiffre d’affaires'].map((h) => (
                      <th
                        key={h}
                        className="text-left text-[11px] text-text-muted font-semibold uppercase tracking-wide pb-2.5 border-b border-border"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.topPrestations.map((p) => (
                    <tr key={p.nom}>
                      <td className="py-2.5 border-b border-sage-light text-sm">{p.nom}</td>
                      <td className="py-2.5 border-b border-sage-light text-sm">{p.count}</td>
                      <td className="py-2.5 border-b border-sage-light text-sm font-semibold text-sage-dark">
                        {formatEuros(p.ca)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default StatsView
