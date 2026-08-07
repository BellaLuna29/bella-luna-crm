import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import MonthlyBarChart from '../components/MonthlyBarChart'

interface Client {
  id: string
  statut: string
  dateCreation: string | null
}

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
  0: 'Dimanche',
}
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

interface RdvItem {
  id: string
  date: string | null
  statut: string
  clienteId: string | null
  prestationNom: string
  prix: number | null
}

interface FactureItem {
  id: string
  date: string | null
  montant: number | null
  categorieFacture: string
  promoId: string | null
  promoNom: string
  payee: boolean
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

function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function startOfMonthIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
}

function monthInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

function inRange(iso: string | null, start: string, end: string): boolean {
  if (!iso) return false
  const day = iso.slice(0, 10)
  return day >= start && day <= end
}

function isInMonthValue(iso: string | null, monthValue: string): boolean {
  if (!iso) return false
  return iso.slice(0, 7) === monthValue
}

function formatMonthLabel(monthValue: string): string {
  const [y, m] = monthValue.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
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
        {delta >= 0 ? '▲' : '▼'} {Math.abs(pct)} % vs période B ({formatValue(previous)})
      </div>
    </div>
  )
}

function StatsView() {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })

  const now = useMemo(() => new Date(), [])
  const defaultThisMonthStart = useMemo(() => startOfMonthIso(now), [now])
  const defaultLastMonth = useMemo(() => new Date(now.getFullYear(), now.getMonth() - 1, 1), [now])
  const defaultLastMonthStart = useMemo(() => startOfMonthIso(defaultLastMonth), [defaultLastMonth])
  const defaultLastMonthEnd = useMemo(() => {
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`
  }, [now])

  const [periodADebut, setPeriodADebut] = useState(defaultThisMonthStart)
  const [periodAFin, setPeriodAFin] = useState(todayIso())
  const [periodBDebut, setPeriodBDebut] = useState(defaultLastMonthStart)
  const [periodBFin, setPeriodBFin] = useState(defaultLastMonthEnd)
  const [prestationsMonth, setPrestationsMonth] = useState(monthInputValue(now))
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

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

  const data = useMemo(() => {
    if (state.status !== 'success') return null

    const commerciales = state.factures.filter((f) => f.categorieFacture !== 'Associatif ou formation')

    const sumFactures = (start: string, end: string) =>
      commerciales.filter((f) => inRange(f.date, start, end)).reduce((sum, f) => sum + (f.montant ?? 0), 0)

    const sumDepenses = (start: string, end: string) =>
      state.depenses.filter((d) => inRange(d.date, start, end)).reduce((sum, d) => sum + (d.montant ?? 0), 0)

    const countRdv = (start: string, end: string) =>
      state.rendezvous.filter((r) => inRange(r.date, start, end)).length

    const countNouvelles = (start: string, end: string) =>
      state.clients.filter((c) => inRange(c.dateCreation, start, end)).length

    const caA = sumFactures(periodADebut, periodAFin)
    const caB = sumFactures(periodBDebut, periodBFin)
    const depensesA = sumDepenses(periodADebut, periodAFin)
    const depensesB = sumDepenses(periodBDebut, periodBFin)

    const prestationStats = new Map<string, { count: number; ca: number }>()
    for (const r of state.rendezvous) {
      if (!isInMonthValue(r.date, prestationsMonth)) continue
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

    const promoStats = new Map<string, { count: number; ca: number }>()
    let sansPromoCount = 0
    let sansPromoCa = 0
    for (const f of commerciales) {
      if (!inRange(f.date, periodADebut, periodAFin)) continue
      if (f.promoId) {
        const entry = promoStats.get(f.promoNom || 'Promotion') ?? { count: 0, ca: 0 }
        entry.count += 1
        entry.ca += f.montant ?? 0
        promoStats.set(f.promoNom || 'Promotion', entry)
      } else {
        sansPromoCount += 1
        sansPromoCa += f.montant ?? 0
      }
    }
    const promoRows = Array.from(promoStats.entries())
      .map(([nom, v]) => ({ nom, count: v.count, ca: v.ca, panierMoyen: v.count > 0 ? v.ca / v.count : 0 }))
      .sort((a, b) => b.count - a.count)

    const facturesA = commerciales.filter((f) => inRange(f.date, periodADebut, periodAFin))
    const facturesB = commerciales.filter((f) => inRange(f.date, periodBDebut, periodBFin))
    const panierMoyenA = facturesA.length > 0 ? caA / facturesA.length : 0
    const panierMoyenB = facturesB.length > 0 ? caB / facturesB.length : 0

    const clientById = new Map(state.clients.map((c) => [c.id, c]))
    const regulieresCount = state.clients.filter((c) => c.statut === 'Régulière').length
    const tauxFidelisation = state.clients.length > 0 ? Math.round((regulieresCount / state.clients.length) * 100) : 0

    const clientIdsActifsA = new Set(
      state.rendezvous
        .filter((r) => r.clienteId && inRange(r.date, periodADebut, periodAFin))
        .map((r) => r.clienteId as string),
    )
    let nouveauxActifs = 0
    let fidelesActifs = 0
    for (const id of clientIdsActifsA) {
      const c = clientById.get(id)
      if (c && inRange(c.dateCreation, periodADebut, periodAFin)) nouveauxActifs += 1
      else fidelesActifs += 1
    }
    const totalActifs = nouveauxActifs + fidelesActifs
    const pctNouveaux = totalActifs > 0 ? Math.round((nouveauxActifs / totalActifs) * 100) : 0
    const pctFideles = totalActifs > 0 ? 100 - pctNouveaux : 0

    const byWeekday = new Array(7).fill(0) as number[]
    for (const r of state.rendezvous) {
      if (!inRange(r.date, periodADebut, periodAFin)) continue
      const d = new Date(r.date as string)
      if (Number.isNaN(d.getTime())) continue
      byWeekday[d.getDay()] += 1
    }
    const totalRdvSemaine = byWeekday.reduce((a, b) => a + b, 0)
    const repartitionSemaine = WEEKDAY_ORDER.map((day) => ({
      label: WEEKDAY_LABELS[day],
      count: byWeekday[day],
      pct: totalRdvSemaine > 0 ? Math.round((byWeekday[day] / totalRdvSemaine) * 100) : 0,
    }))

    const rdvPeriodeA = state.rendezvous.filter((r) => inRange(r.date, periodADebut, periodAFin))
    const annulesA = rdvPeriodeA.filter((r) => r.statut === 'Annulé').length
    const tauxAnnulation = rdvPeriodeA.length > 0 ? Math.round((annulesA / rdvPeriodeA.length) * 100) : 0

    const rdvPeriodeB = state.rendezvous.filter((r) => inRange(r.date, periodBDebut, periodBFin))
    const annulesB = rdvPeriodeB.filter((r) => r.statut === 'Annulé').length
    const tauxAnnulationB = rdvPeriodeB.length > 0 ? Math.round((annulesB / rdvPeriodeB.length) * 100) : 0

    const facturesImpayees = state.factures.filter((f) => !f.payee)
    const facturesImpayeesCount = facturesImpayees.length
    const facturesImpayeesMontant = facturesImpayees.reduce((sum, f) => sum + (f.montant ?? 0), 0)

    return {
      caA,
      caB,
      depensesA,
      depensesB,
      resultatA: caA - depensesA,
      resultatB: caB - depensesB,
      rdvA: countRdv(periodADebut, periodAFin),
      rdvB: countRdv(periodBDebut, periodBFin),
      nouvellesA: countNouvelles(periodADebut, periodAFin),
      nouvellesB: countNouvelles(periodBDebut, periodBFin),
      topPrestations,
      promoRows,
      sansPromoCount,
      sansPromoCa,
      sansPromoPanierMoyen: sansPromoCount > 0 ? sansPromoCa / sansPromoCount : 0,
      panierMoyenA,
      panierMoyenB,
      tauxFidelisation,
      pctNouveaux,
      pctFideles,
      totalActifs,
      repartitionSemaine,
      tauxAnnulation,
      tauxAnnulationB,
      annulesA,
      totalRdvA: rdvPeriodeA.length,
      facturesImpayeesCount,
      facturesImpayeesMontant,
    }
  }, [state, periodADebut, periodAFin, periodBDebut, periodBFin, prestationsMonth])

  const yearlyData = useMemo(() => {
    if (state.status !== 'success') return null
    const commerciales = state.factures.filter((f) => f.categorieFacture !== 'Associatif ou formation')

    const monthlyCA = MONTH_LABELS.map((label, i) => {
      const start = `${selectedYear}-${String(i + 1).padStart(2, '0')}-01`
      const endDay = new Date(selectedYear, i + 1, 0).getDate()
      const end = `${selectedYear}-${String(i + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
      return {
        label,
        value: commerciales.filter((f) => inRange(f.date, start, end)).reduce((sum, f) => sum + (f.montant ?? 0), 0),
      }
    })

    const monthlyRdv = MONTH_LABELS.map((label, i) => {
      const start = `${selectedYear}-${String(i + 1).padStart(2, '0')}-01`
      const endDay = new Date(selectedYear, i + 1, 0).getDate()
      const end = `${selectedYear}-${String(i + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
      return { label, value: state.rendezvous.filter((r) => inRange(r.date, start, end)).length }
    })

    const totalCaAnnee = monthlyCA.reduce((sum, m) => sum + m.value, 0)
    const totalRdvAnnee = monthlyRdv.reduce((sum, m) => sum + m.value, 0)

    return { monthlyCA, monthlyRdv, totalCaAnnee, totalRdvAnnee }
  }, [state, selectedYear])

  const availableYears = useMemo(() => {
    if (state.status !== 'success') return [now.getFullYear()]
    const years = new Set<number>([now.getFullYear()])
    for (const f of state.factures) {
      if (f.date) years.add(Number(f.date.slice(0, 4)))
    }
    for (const r of state.rendezvous) {
      if (r.date) years.add(Number(r.date.slice(0, 4)))
    }
    return Array.from(years).sort((a, b) => b - a)
  }, [state, now])

  const landingStats = useMemo(() => {
    if (state.status !== 'success') return null
    const yearStart = `${selectedYear}-01-01`
    const yearEnd = `${selectedYear}-12-31`
    const rdvAnnee = state.rendezvous.filter((r) => inRange(r.date, yearStart, yearEnd))
    const annulesAnnee = rdvAnnee.filter((r) => r.statut === 'Annulé').length
    const tauxAnnulationAnnee = rdvAnnee.length > 0 ? Math.round((annulesAnnee / rdvAnnee.length) * 100) : 0
    const nouvellesAnnee = state.clients.filter((c) => inRange(c.dateCreation, yearStart, yearEnd)).length
    return { tauxAnnulationAnnee, nouvellesAnnee }
  }, [state, selectedYear])

  const [subTab, setSubTab] = useState<'apercu' | 'comparaison' | 'prestations'>('apercu')
  const TABS: { key: typeof subTab; label: string }[] = [
    { key: 'apercu', label: "Vue d'ensemble" },
    { key: 'comparaison', label: 'Comparaison de périodes' },
    { key: 'prestations', label: 'Prestations & promotions' },
  ]

  return (
    <div>
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`px-3.5 py-2 rounded-[10px] text-sm font-semibold transition-colors ${
              subTab === tab.key ? 'bg-sage-dark text-white' : 'bg-white border border-border text-text-muted hover:bg-sage-pale'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {state.status === 'loading' && <p className="text-sm text-text-muted">Chargement…</p>}
      {state.status === 'error' && <p className="text-sm text-danger">{state.message}</p>}

      {state.status === 'success' && data && landingStats && (
        <div className="flex flex-col gap-6">
          {subTab === 'apercu' && yearlyData && (
            <>
              <div className="bg-white border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
                  <h3 className="font-serif text-lg font-semibold text-sage-dark">Vue sur l'année</h3>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="input max-w-28"
                  >
                    {availableYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-3">
                  <div>
                    <p className="text-xs text-text-muted mb-2">
                      Chiffre d'affaires par mois — {formatEuros(yearlyData.totalCaAnnee)} sur l'année
                    </p>
                    <MonthlyBarChart data={yearlyData.monthlyCA} color="#3A5A50" formatValue={formatEuros} />
                  </div>
                  <div>
                    <p className="text-xs text-text-muted mb-2">
                      Rendez-vous par mois — {yearlyData.totalRdvAnnee} sur l'année
                    </p>
                    <MonthlyBarChart data={yearlyData.monthlyRdv} color="#C9A86A" formatValue={(n) => `${n} RDV`} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                <StatTile label="Chiffre d'affaires (année)" value={formatEuros(yearlyData.totalCaAnnee)} />
                <StatTile label="Rendez-vous (année)" value={String(yearlyData.totalRdvAnnee)} />
                <StatTile label="Nouvelles clientes (année)" value={String(landingStats.nouvellesAnnee)} />
                <StatTile label="Taux de fidélisation" value={`${data.tauxFidelisation} %`} />
                <StatTile label="Taux d'annulation (année)" value={`${landingStats.tauxAnnulationAnnee} %`} />
                <StatTile label="Factures impayées" value={formatEuros(data.facturesImpayeesMontant)} />
              </div>
            </>
          )}

          {subTab === 'comparaison' && (
            <>
              <div className="bg-white border border-border rounded-2xl p-5">
                <h3 className="font-serif text-lg font-semibold text-sage-dark mb-3">Comparer deux périodes</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                      Période A
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="date" value={periodADebut} onChange={(e) => setPeriodADebut(e.target.value)} className="input" />
                      <span className="text-text-muted text-sm">→</span>
                      <input type="date" value={periodAFin} onChange={(e) => setPeriodAFin(e.target.value)} className="input" />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                      Période B
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="date" value={periodBDebut} onChange={(e) => setPeriodBDebut(e.target.value)} className="input" />
                      <span className="text-text-muted text-sm">→</span>
                      <input type="date" value={periodBFin} onChange={(e) => setPeriodBFin(e.target.value)} className="input" />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-text-muted mt-3">
                  Le chiffre d'affaires et le résultat net excluent les factures « Associatif ou formation ».
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                <ComparisonCard label="Chiffre d'affaires facturé" current={data.caA} previous={data.caB} formatValue={formatEuros} />
                <ComparisonCard
                  label="Dépenses"
                  current={data.depensesA}
                  previous={data.depensesB}
                  formatValue={formatEuros}
                  positiveIsGood={false}
                />
                <ComparisonCard label="Résultat net" current={data.resultatA} previous={data.resultatB} formatValue={formatEuros} />
                <ComparisonCard label="Rendez-vous" current={data.rdvA} previous={data.rdvB} />
                <ComparisonCard label="Nouvelles clientes" current={data.nouvellesA} previous={data.nouvellesB} />
                <ComparisonCard label="Panier moyen" current={data.panierMoyenA} previous={data.panierMoyenB} formatValue={formatEuros} />
                <ComparisonCard
                  label="Taux d'annulation"
                  current={data.tauxAnnulation}
                  previous={data.tauxAnnulationB}
                  formatValue={(n) => `${n} %`}
                  positiveIsGood={false}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-border rounded-2xl p-5">
                  <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Taux de fidélisation</h3>
                  <p className="text-xs text-text-muted mb-3">Part des clientes au statut « Régulière » dans ta base.</p>
                  <div className="font-serif text-4xl font-semibold text-sage-dark">{data.tauxFidelisation} %</div>
                </div>
                <div className="bg-white border border-border rounded-2xl p-5">
                  <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Clientes actives : nouvelles vs fidèles</h3>
                  <p className="text-xs text-text-muted mb-3">Sur la période A ({data.totalActifs} cliente{data.totalActifs > 1 ? 's' : ''} vue{data.totalActifs > 1 ? 's' : ''}).</p>
                  <div className="flex items-center gap-8">
                    <div>
                      <div className="font-serif text-3xl font-semibold text-sage-dark">{data.pctNouveaux} %</div>
                      <div className="text-xs text-text-muted">Nouvelles clientes</div>
                    </div>
                    <div>
                      <div className="font-serif text-3xl font-semibold text-sage-dark">{data.pctFideles} %</div>
                      <div className="text-xs text-text-muted">Clientes fidèles</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-border rounded-2xl p-5">
                <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Rendez-vous par jour de la semaine</h3>
                <p className="text-xs text-text-muted mb-4">Répartition sur la période A.</p>
                {data.repartitionSemaine.every((d) => d.count === 0) ? (
                  <p className="text-sm text-text-muted">Aucun rendez-vous sur cette période.</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {data.repartitionSemaine.map((d) => (
                      <div key={d.label} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-sm text-text-muted">{d.label}</span>
                        <div className="flex-1 h-2.5 bg-sage-pale rounded-full overflow-hidden">
                          <div className="h-full bg-sage-dark rounded-full" style={{ width: `${d.pct}%` }} />
                        </div>
                        <span className="w-16 shrink-0 text-sm font-semibold text-sage-dark text-right">{d.count} RDV</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {subTab === 'prestations' && (
            <>
              <div className="bg-white border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                  <h3 className="font-serif text-lg font-semibold text-sage-dark">Prestations les plus demandées</h3>
                  <input
                    type="month"
                    value={prestationsMonth}
                    onChange={(e) => setPrestationsMonth(e.target.value)}
                    className="input max-w-48"
                  />
                </div>
                {data.topPrestations.length === 0 ? (
                  <p className="text-sm text-text-muted">
                    Aucun rendez-vous en {formatMonthLabel(prestationsMonth)}.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {['Prestation', 'Part des RDV', 'Nombre de RDV', "Chiffre d'affaires"].map((h) => (
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
                      {data.topPrestations.map((p, i) => {
                        const maxCount = data.topPrestations[0]?.count ?? 1
                        const pct = maxCount > 0 ? Math.round((p.count / maxCount) * 100) : 0
                        return (
                        <tr key={p.nom}>
                          <td className="py-2.5 border-b border-sage-light text-sm">{p.nom}</td>
                          <td className="py-2.5 border-b border-sage-light text-sm w-40">
                            <div className="h-2 bg-sage-pale rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${i === 0 ? 'bg-sage-dark' : 'bg-sage-light'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </td>
                          <td className="py-2.5 border-b border-sage-light text-sm">{p.count}</td>
                          <td className="py-2.5 border-b border-sage-light text-sm font-semibold text-sage-dark">
                            {formatEuros(p.ca)}
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>

              <div className="bg-white border border-border rounded-2xl p-5">
                <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Rentabilité des promotions</h3>
                <p className="text-xs text-text-muted mb-4">Sur la période A, comparé au panier moyen sans promotion.</p>
                {data.promoRows.length === 0 && data.sansPromoCount === 0 ? (
                  <p className="text-sm text-text-muted">Aucune facture sur cette période.</p>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        {['Promotion', 'Factures', 'CA généré', 'Panier moyen'].map((h) => (
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
                      {data.promoRows.map((p) => (
                        <tr key={p.nom}>
                          <td className="py-2.5 border-b border-sage-light text-sm">{p.nom}</td>
                          <td className="py-2.5 border-b border-sage-light text-sm">{p.count}</td>
                          <td className="py-2.5 border-b border-sage-light text-sm font-semibold text-sage-dark">
                            {formatEuros(p.ca)}
                          </td>
                          <td className="py-2.5 border-b border-sage-light text-sm">{formatEuros(p.panierMoyen)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="py-2.5 text-sm text-text-muted italic">Sans promotion</td>
                        <td className="py-2.5 text-sm text-text-muted">{data.sansPromoCount}</td>
                        <td className="py-2.5 text-sm font-semibold text-sage-dark">{formatEuros(data.sansPromoCa)}</td>
                        <td className="py-2.5 text-sm text-text-muted">{formatEuros(data.sansPromoPanierMoyen)}</td>
                      </tr>
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-border rounded-2xl p-5">
      <div className="text-xs font-semibold text-text-muted uppercase tracking-wide">{label}</div>
      <div className="font-serif text-2xl font-semibold text-sage-dark mt-1.5">{value}</div>
    </div>
  )
}

export default StatsView
