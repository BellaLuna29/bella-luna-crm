import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import { formatMontant } from '../lib/formatMontant'

interface Prestation {
  id: string
  nom: string
  categorie: string
  duree: string
  prix: number
  type: string
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; prestations: Prestation[] }

interface FormState {
  nom: string
  categorie: string
  duree: string
  prix: string
  type: string
}

const EMPTY_FORM: FormState = { nom: '', categorie: '', duree: '', prix: '', type: '' }

function PrestationsView() {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(() => {
    setState({ status: 'loading' })
    apiFetch<{ prestations: Prestation[] }>(getToken, '/api/prestations')
      .then((data) => setState({ status: 'success', prestations: data.prestations }))
      .catch((error: unknown) => {
        setState({ status: 'error', message: error instanceof ApiError ? error.message : 'Erreur inconnue.' })
      })
  }, [getToken])

  useEffect(() => {
    load()
  }, [load])

  const { categories, types } = useMemo(() => {
    if (state.status !== 'success') return { categories: [], types: [] }
    return {
      categories: Array.from(new Set(state.prestations.map((p) => p.categorie).filter(Boolean))).sort(),
      types: Array.from(new Set(state.prestations.map((p) => p.type).filter(Boolean))).sort(),
    }
  }, [state])

  const filtered = useMemo(() => {
    if (state.status !== 'success') return []
    const q = search.trim().toLowerCase()
    if (!q) return state.prestations
    return state.prestations.filter(
      (p) => p.nom.toLowerCase().includes(q) || p.categorie.toLowerCase().includes(q),
    )
  }, [state, search])

  function toBody(f: FormState) {
    return {
      nom: f.nom.trim(),
      categorie: f.categorie.trim(),
      duree: f.duree.trim(),
      prix: Number(f.prix),
      type: f.type.trim(),
    }
  }

  function validate(f: FormState): string | null {
    if (!f.nom.trim()) return 'Le nom de la prestation est obligatoire.'
    const prix = Number(f.prix)
    if (!Number.isFinite(prix) || prix < 0) return 'Le prix doit être un nombre positif.'
    return null
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const err = validate(form)
    if (err) {
      setFormError(err)
      return
    }
    setFormError(null)
    setSaving(true)
    try {
      await apiFetch(getToken, '/api/prestations', { method: 'POST', body: toBody(form) })
      setForm(EMPTY_FORM)
      setShowCreate(false)
      load()
    } catch (err2) {
      setFormError(err2 instanceof ApiError ? err2.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(p: Prestation) {
    setEditingId(p.id)
    setEditForm({ nom: p.nom, categorie: p.categorie, duree: p.duree, prix: String(p.prix), type: p.type })
    setFormError(null)
  }

  async function saveEdit(id: string) {
    const err = validate(editForm)
    if (err) {
      setFormError(err)
      return
    }
    setFormError(null)
    setSaving(true)
    try {
      await apiFetch(getToken, `/api/prestations?id=${id}`, { method: 'PATCH', body: toBody(editForm) })
      setEditingId(null)
      load()
    } catch (err2) {
      setFormError(err2 instanceof ApiError ? err2.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setRowError(null)
    try {
      await apiFetch(getToken, `/api/prestations?id=${id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Impossible de supprimer la prestation.')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
          <input
            type="text"
            placeholder="Rechercher une prestation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 max-w-sm px-4 py-2.5 rounded-[10px] border border-border text-sm bg-white"
          />
        </div>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setFormError(null)
          }}
          className="bg-sage-dark text-white px-4.5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-dark/90 shrink-0"
        >
          Ajouter une prestation
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border border-border rounded-2xl p-5 mb-5 flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-text-muted mb-1">Nom de la prestation *</span>
              <input
                type="text"
                value={form.nom}
                onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                className="input"
                placeholder="Ex : Massage Signature"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-text-muted mb-1">Catégorie</span>
              <input
                type="text"
                list="prestation-categories"
                value={form.categorie}
                onChange={(e) => setForm((f) => ({ ...f, categorie: e.target.value }))}
                className="input"
                placeholder="Ex : Massages Relaxants"
              />
              <datalist id="prestation-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-text-muted mb-1">Durée</span>
              <input
                type="text"
                value={form.duree}
                onChange={(e) => setForm((f) => ({ ...f, duree: e.target.value }))}
                className="input"
                placeholder="Ex : 60 min, 1h30"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-text-muted mb-1">Prix (€) *</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.prix}
                onChange={(e) => setForm((f) => ({ ...f, prix: e.target.value }))}
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-text-muted mb-1">Type</span>
              <input
                type="text"
                list="prestation-types"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                className="input"
                placeholder="Ex : Séance unique, Cure 8 séances"
              />
              <datalist id="prestation-types">
                {types.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
          </div>
          <p className="text-xs text-text-muted">
            Astuce : pour qu'une prestation soit suivie automatiquement comme une cure (progression des séances), donne
            au Type le format « Cure X séances » (ex : « Cure 8 séances »).
          </p>
          {formError && <p className="text-sm text-danger">{formError}</p>}
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

      {rowError && <p className="text-sm text-danger mb-3">{rowError}</p>}

      <div className="bg-white border border-border rounded-2xl overflow-hidden">
        {state.status === 'loading' && <p className="p-6 text-sm text-text-muted">Chargement…</p>}
        {state.status === 'error' && <p className="p-6 text-sm text-danger">{state.message}</p>}

        {state.status === 'success' && (
          <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Prestation', 'Catégorie', 'Durée', 'Prix', 'Type', ''].map((h) => (
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
              {filtered.map((p) =>
                editingId === p.id ? (
                  <tr key={p.id} className="bg-sage-pale">
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={editForm.nom}
                        onChange={(e) => setEditForm((f) => ({ ...f, nom: e.target.value }))}
                        className="input"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        list="prestation-categories"
                        value={editForm.categorie}
                        onChange={(e) => setEditForm((f) => ({ ...f, categorie: e.target.value }))}
                        className="input"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={editForm.duree}
                        onChange={(e) => setEditForm((f) => ({ ...f, duree: e.target.value }))}
                        className="input"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={editForm.prix}
                        onChange={(e) => setEditForm((f) => ({ ...f, prix: e.target.value }))}
                        className="input"
                      />
                    </td>
                    <td className="px-4 py-3" colSpan={2}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="text"
                          list="prestation-types"
                          value={editForm.type}
                          onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))}
                          className="input max-w-40"
                        />
                        {formError && <p className="text-xs text-danger w-full">{formError}</p>}
                        <button
                          onClick={() => saveEdit(p.id)}
                          disabled={saving}
                          className="text-xs font-semibold text-sage-dark hover:underline"
                        >
                          Enregistrer
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs font-semibold text-text-muted hover:underline"
                        >
                          Annuler
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} className="hover:bg-sage-pale transition-colors">
                    <td className="px-4 py-3.5 border-b border-sage-light text-sm font-semibold">{p.nom}</td>
                    <td className="px-4 py-3.5 border-b border-sage-light text-sm text-text-muted">
                      {p.categorie || '—'}
                    </td>
                    <td className="px-4 py-3.5 border-b border-sage-light text-sm text-text-muted whitespace-nowrap">
                      {p.duree || '—'}
                    </td>
                    <td className="px-4 py-3.5 border-b border-sage-light text-sm font-semibold text-sage-dark">
                      {formatMontant(p.prix)}
                    </td>
                    <td className="px-4 py-3.5 border-b border-sage-light">
                      {p.type ? (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full inline-block bg-sage-light text-sage-dark">
                          {p.type}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 border-b border-sage-light text-right whitespace-nowrap">
                      <button
                        onClick={() => startEdit(p)}
                        className="text-xs font-semibold text-sage-dark hover:underline mr-3"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-xs font-semibold text-danger hover:underline"
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ),
              )}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-muted">
                    Aucune prestation ne correspond à la recherche.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default PrestationsView
