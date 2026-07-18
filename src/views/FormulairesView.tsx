import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import SearchableSelect from '../components/SearchableSelect'

interface Questionnaire {
  id: string
  nom: string
  categorie: string
  lien: string
  clienteIds: string[]
}

interface Client {
  id: string
  nomComplet: string
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; questionnaires: Questionnaire[]; clients: Client[] }

function FormulairesView() {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [pickCliente, setPickCliente] = useState<Record<string, string>>({})
  const [showCreate, setShowCreate] = useState(false)
  const [nom, setNom] = useState('')
  const [categorie, setCategorie] = useState('')
  const [lien, setLien] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    Promise.all([
      apiFetch<{ questionnaires: Questionnaire[] }>(getToken, '/api/prestations?resource=questionnaires'),
      apiFetch<{ clients: Client[] }>(getToken, '/api/clients'),
    ])
      .then(([qData, cData]) => {
        setState({ status: 'success', questionnaires: qData.questionnaires, clients: cData.clients })
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

  const clientById = useMemo(() => {
    if (state.status !== 'success') return new Map<string, Client>()
    return new Map(state.clients.map((c) => [c.id, c]))
  }, [state])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    if (!nom.trim() || !lien.trim()) {
      setCreateError('Le nom et le lien sont obligatoires.')
      return
    }
    setSaving(true)
    try {
      await apiFetch(getToken, '/api/prestations?resource=questionnaires', {
        method: 'POST',
        body: { nom: nom.trim(), categorie: categorie.trim(), lien: lien.trim() },
      })
      setNom('')
      setCategorie('')
      setLien('')
      setShowCreate(false)
      load()
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setRowError(null)
    try {
      await apiFetch(getToken, `/api/prestations?resource=questionnaires&id=${id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    }
  }

  async function handleLinkCliente(q: Questionnaire) {
    const clienteId = pickCliente[q.id]
    if (!clienteId || q.clienteIds.includes(clienteId)) return
    setRowError(null)
    try {
      await apiFetch(getToken, `/api/prestations?resource=questionnaires&id=${q.id}`, {
        method: 'PATCH',
        body: { clienteIds: [...q.clienteIds, clienteId] },
      })
      setPickCliente((prev) => ({ ...prev, [q.id]: '' }))
      load()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    }
  }

  async function handleUnlinkCliente(q: Questionnaire, clienteId: string) {
    setRowError(null)
    try {
      await apiFetch(getToken, `/api/prestations?resource=questionnaires&id=${q.id}`, {
        method: 'PATCH',
        body: { clienteIds: q.clienteIds.filter((id) => id !== clienteId) },
      })
      load()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-text-muted">
          Gère les questionnaires envoyés avant les rendez-vous et lie-les aux clientes concernées.
        </p>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="bg-sage-dark text-white px-4.5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-dark/90 shrink-0"
        >
          Ajouter un formulaire
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border border-border rounded-2xl p-5 mb-5 flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-text-muted mb-1">Nom *</span>
              <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-text-muted mb-1">Catégorie</span>
              <input type="text" value={categorie} onChange={(e) => setCategorie(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-text-muted mb-1">Lien Google Form *</span>
              <input type="url" value={lien} onChange={(e) => setLien(e.target.value)} className="input" />
            </label>
          </div>
          {createError && <p className="text-sm text-danger">{createError}</p>}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2.5 rounded-[10px] text-sm font-semibold text-text-muted hover:bg-sage-pale"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-sage-dark text-white px-5 py-2.5 rounded-[10px] text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}

      {rowError && <p className="text-sm text-danger mb-4">{rowError}</p>}

      {state.status === 'loading' && <p className="text-sm text-text-muted">Chargement…</p>}
      {state.status === 'error' && <p className="text-sm text-danger">{state.message}</p>}

      {state.status === 'success' && (
        <div className="flex flex-col gap-4">
          {state.questionnaires.length === 0 ? (
            <p className="text-sm text-text-muted">Aucun formulaire enregistré.</p>
          ) : (
            state.questionnaires.map((q) => (
              <div key={q.id} className="bg-white border border-border rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-serif text-lg font-semibold text-sage-dark">{q.nom}</div>
                    {q.categorie && (
                      <span className="inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sage-light text-sage-dark">
                        {q.categorie}
                      </span>
                    )}
                    {q.lien ? (
                      <div className="mt-2">
                        <a
                          href={q.lien}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-sage-dark font-semibold hover:underline break-all"
                        >
                          {q.lien}
                        </a>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-danger">Aucun lien renseigné.</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(q.id)}
                    className="text-xs font-semibold text-danger hover:underline shrink-0"
                  >
                    Supprimer
                  </button>
                </div>

                <div className="mt-4 pt-4 border-t border-sage-light">
                  <div className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                    Clientes liées
                  </div>
                  {q.clienteIds.length === 0 ? (
                    <p className="text-sm text-text-muted mb-3">Aucune cliente liée.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {q.clienteIds.map((id) => (
                        <span
                          key={id}
                          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-sage-pale text-sage-dark"
                        >
                          {clientById.get(id)?.nomComplet ?? 'Cliente inconnue'}
                          <button onClick={() => handleUnlinkCliente(q, id)} className="hover:opacity-70">
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 max-w-sm">
                    <div className="flex-1">
                      <SearchableSelect
                        options={state.clients
                          .filter((c) => !q.clienteIds.includes(c.id))
                          .map((c) => ({ id: c.id, label: c.nomComplet }))}
                        value={pickCliente[q.id] ?? ''}
                        onChange={(id) => setPickCliente((prev) => ({ ...prev, [q.id]: id }))}
                        placeholder="Ajouter une cliente..."
                        emptyLabel="Aucune cliente trouvée."
                      />
                    </div>
                    <button
                      onClick={() => handleLinkCliente(q)}
                      disabled={!pickCliente[q.id]}
                      className="bg-white border border-border text-sage-dark px-3.5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-pale disabled:opacity-50 shrink-0"
                    >
                      Lier
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default FormulairesView
