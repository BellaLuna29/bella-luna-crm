import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import StatusPill from '../components/StatusPill'
import ClientFormModal from '../components/ClientFormModal'

interface Client {
  id: string
  nomComplet: string
  telephone: string
  email: string
  metier: string
  categorieMetier: string
  notes: string
  statut: string
  newsletter: boolean
}

const CATEGORIE_METIER_OPTIONS = [
  'Médecine',
  'Sport',
  'Métier extérieur',
  'Métier de bureau',
  'Commerce',
  'Artisanat',
  'Autre',
]

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; clients: Client[] }

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

interface ClientsListViewProps {
  onSelectClient: (id: string) => void
}

function ClientsListView({ onSelectClient }: ClientsListViewProps) {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [search, setSearch] = useState('')
  const [categorieFilter, setCategorieFilter] = useState('')
  const [newsletterOnly, setNewsletterOnly] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    apiFetch<{ clients: Client[] }>(getToken, '/api/clients')
      .then((data) => {
        setState({ status: 'success', clients: data.clients })
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

  const filtered = useMemo(() => {
    if (state.status !== 'success') return []
    const q = search.trim().toLowerCase()
    return state.clients.filter((c) => {
      if (q && !c.nomComplet.toLowerCase().includes(q)) return false
      if (categorieFilter && c.categorieMetier !== categorieFilter) return false
      if (newsletterOnly && !c.newsletter) return false
      return true
    })
  }, [state, search, categorieFilter, newsletterOnly])

  return (
    <div>
      <div className="flex justify-between items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Rechercher une cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 max-w-sm px-4 py-2.5 rounded-[10px] border border-border text-sm bg-white"
          />
          <select
            value={categorieFilter}
            onChange={(e) => setCategorieFilter(e.target.value)}
            className="px-3 py-2.5 rounded-[10px] border border-border text-sm bg-white"
          >
            <option value="">Toutes catégories</option>
            {CATEGORIE_METIER_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-text-muted whitespace-nowrap">
            <input
              type="checkbox"
              checked={newsletterOnly}
              onChange={(e) => setNewsletterOnly(e.target.checked)}
              className="w-4 h-4"
            />
            Inscrites newsletter uniquement
          </label>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-sage-dark text-white px-4.5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-dark/90"
        >
          Ajouter une cliente
        </button>
      </div>

      <div className="bg-white border border-border rounded-2xl overflow-hidden">
        {state.status === 'loading' && (
          <p className="p-6 text-sm text-text-muted">Chargement…</p>
        )}

        {state.status === 'error' && (
          <p className="p-6 text-sm text-danger">{state.message}</p>
        )}

        {state.status === 'success' && (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Cliente', 'Téléphone', 'Métier', 'Catégorie', 'Newsletter', 'Statut', 'Notes'].map((h) => (
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
              {filtered.map((client) => (
                <tr
                  key={client.id}
                  onClick={() => onSelectClient(client.id)}
                  className="cursor-pointer hover:bg-sage-pale transition-colors"
                >
                  <td className="px-4 py-3.5 border-b border-sage-light">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-sage-light text-sage-dark flex items-center justify-center font-semibold text-xs shrink-0">
                        {initials(client.nomComplet)}
                      </div>
                      {client.nomComplet}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 border-b border-sage-light text-sm">
                    {client.telephone}
                  </td>
                  <td className="px-4 py-3.5 border-b border-sage-light text-sm">
                    {client.metier}
                  </td>
                  <td className="px-4 py-3.5 border-b border-sage-light text-sm text-text-muted">
                    {client.categorieMetier || '—'}
                  </td>
                  <td className="px-4 py-3.5 border-b border-sage-light text-sm">
                    {client.newsletter ? (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full inline-block bg-sage-light text-sage-dark">
                        Inscrite
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 border-b border-sage-light">
                    <StatusPill statut={client.statut} />
                  </td>
                  <td className="px-4 py-3.5 border-b border-sage-light text-sm text-text-muted">
                    {client.notes}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-text-muted">
                    Aucune cliente ne correspond à la recherche.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <ClientFormModal
          mode="create"
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

export default ClientsListView
