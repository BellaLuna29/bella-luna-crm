import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import FactureFormModal from '../components/FactureFormModal'

interface FactureItem {
  id: string
  date: string | null
  montant: number | null
  payee: boolean
  clienteId: string | null
  clienteNom: string
  promoAppliquee: boolean
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; factures: FactureItem[] }

type Filter = 'toutes' | 'payees' | 'impayees'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatMontant(montant: number | null): string {
  if (montant === null) return '—'
  return `${montant.toFixed(2)} €`
}

function isThisMonth(iso: string | null, now: Date): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

interface FacturationViewProps {
  onSelectClient: (id: string) => void
}

function FacturationView({ onSelectClient }: FacturationViewProps) {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [filter, setFilter] = useState<Filter>('toutes')
  const [showCreate, setShowCreate] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    apiFetch<{ factures: FactureItem[] }>(getToken, '/api/factures')
      .then((data) => setState({ status: 'success', factures: data.factures }))
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
    const encaisseMois = state.factures
      .filter((f) => f.payee && isThisMonth(f.date, now))
      .reduce((sum, f) => sum + (f.montant ?? 0), 0)
    const impayees = state.factures.filter((f) => !f.payee)
    const totalImpaye = impayees.reduce((sum, f) => sum + (f.montant ?? 0), 0)
    return {
      encaisseMois,
      totalImpaye,
      nbImpayees: impayees.length,
      total: state.factures.length,
    }
  }, [state, now])

  const filtered = useMemo(() => {
    if (state.status !== 'success') return []
    if (filter === 'payees') return state.factures.filter((f) => f.payee)
    if (filter === 'impayees') return state.factures.filter((f) => !f.payee)
    return state.factures
  }, [state, filter])

  async function togglePayee(facture: FactureItem) {
    setTogglingId(facture.id)
    try {
      await apiFetch(getToken, `/api/factures/${facture.id}`, {
        method: 'PATCH',
        body: { payee: !facture.payee },
      })
      load()
    } catch {
      setTogglingId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {(['toutes', 'impayees', 'payees'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-2 rounded-[10px] text-sm font-semibold transition-colors ${
                filter === f ? 'bg-sage-dark text-white' : 'bg-white border border-border text-text-muted hover:bg-sage-pale'
              }`}
            >
              {f === 'toutes' ? 'Toutes' : f === 'impayees' ? 'Impayées' : 'Payées'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-sage-dark text-white px-4.5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-dark/90"
        >
          Nouvelle facture
        </button>
      </div>

      {state.status === 'success' && stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-border rounded-2xl p-5">
            <div className="text-xs font-semibold text-text-muted uppercase tracking-wide">Encaissé ce mois-ci</div>
            <div className="font-serif text-3xl font-semibold text-sage-dark mt-1.5">
              {stats.encaisseMois.toFixed(2)} €
            </div>
          </div>
          <div className="bg-white border border-border rounded-2xl p-5">
            <div className="text-xs font-semibold text-text-muted uppercase tracking-wide">Total impayé</div>
            <div className="font-serif text-3xl font-semibold text-danger mt-1.5">
              {stats.totalImpaye.toFixed(2)} €
            </div>
          </div>
          <div className="bg-white border border-border rounded-2xl p-5">
            <div className="text-xs font-semibold text-text-muted uppercase tracking-wide">Factures impayées</div>
            <div className="font-serif text-3xl font-semibold text-sage-dark mt-1.5">{stats.nbImpayees}</div>
          </div>
        </div>
      )}

      <div className="bg-white border border-border rounded-2xl overflow-hidden">
        {state.status === 'loading' && <p className="p-6 text-sm text-text-muted">Chargement…</p>}
        {state.status === 'error' && <p className="p-6 text-sm text-danger">{state.message}</p>}

        {state.status === 'success' && (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Cliente', 'Date', 'Montant', 'Promo', 'Statut', ''].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[11px] text-text-muted font-semibold uppercase tracking-wide px-4 pb-2.5 pt-4 border-b border-border"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f.id} className="hover:bg-sage-pale transition-colors">
                  <td
                    onClick={() => f.clienteId && onSelectClient(f.clienteId)}
                    className="px-4 py-3.5 border-b border-sage-light text-sm cursor-pointer"
                  >
                    {f.clienteNom || 'Cliente inconnue'}
                  </td>
                  <td className="px-4 py-3.5 border-b border-sage-light text-sm">{formatDate(f.date)}</td>
                  <td className="px-4 py-3.5 border-b border-sage-light text-sm font-semibold">
                    {formatMontant(f.montant)}
                  </td>
                  <td className="px-4 py-3.5 border-b border-sage-light text-sm text-text-muted">
                    {f.promoAppliquee ? 'Oui' : '—'}
                  </td>
                  <td className="px-4 py-3.5 border-b border-sage-light">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full inline-block ${
                        f.payee ? 'bg-sage-light text-sage-dark' : 'bg-danger-pale text-danger'
                      }`}
                    >
                      {f.payee ? 'Payée' : 'Impayée'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 border-b border-sage-light text-right">
                    <button
                      onClick={() => togglePayee(f)}
                      disabled={togglingId === f.id}
                      className="text-xs font-semibold text-sage-dark hover:underline disabled:opacity-50"
                    >
                      {f.payee ? 'Marquer impayée' : 'Marquer payée'}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-muted">
                    Aucune facture à afficher.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <FactureFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false)
            load()
          }}
        />
      )}
    </div>
  )
}

export default FacturationView
