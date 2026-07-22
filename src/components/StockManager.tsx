import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'

interface StockItem {
  id: string
  nom: string
  quantite: number
  seuilBas: number
  unite: string
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; stock: StockItem[] }

interface FormState {
  nom: string
  quantite: string
  seuilBas: string
  unite: string
}

const EMPTY_FORM: FormState = { nom: '', quantite: '', seuilBas: '', unite: '' }

function stockStatut(item: StockItem): { label: string; className: string } {
  if (item.quantite <= 0) return { label: 'Rupture', className: 'bg-danger-pale text-danger' }
  if (item.quantite <= item.seuilBas) return { label: 'Bas', className: 'bg-gold-pale text-gold-text' }
  return { label: 'En stock', className: 'bg-sage-light text-sage-dark' }
}

function StockManager() {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    apiFetch<{ stock: StockItem[] }>(getToken, '/api/prestations?resource=stock')
      .then((data) => setState({ status: 'success', stock: data.stock }))
      .catch((error: unknown) => {
        setState({ status: 'error', message: error instanceof ApiError ? error.message : 'Erreur inconnue.' })
      })
  }, [getToken])

  useEffect(() => {
    load()
  }, [load])

  function toBody(f: FormState) {
    return {
      nom: f.nom.trim(),
      quantite: Number(f.quantite),
      seuilBas: Number(f.seuilBas),
      unite: f.unite.trim(),
    }
  }

  function validate(f: FormState): string | null {
    if (!f.nom.trim()) return 'Le nom du produit est obligatoire.'
    const qte = Number(f.quantite)
    const seuil = Number(f.seuilBas)
    if (!Number.isFinite(qte) || qte < 0) return 'La quantité doit être un nombre positif.'
    if (!Number.isFinite(seuil) || seuil < 0) return 'Le seuil bas doit être un nombre positif.'
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
      await apiFetch(getToken, '/api/prestations?resource=stock', { method: 'POST', body: toBody(form) })
      setForm(EMPTY_FORM)
      setShowCreate(false)
      load()
    } catch (err2) {
      setFormError(err2 instanceof ApiError ? err2.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(item: StockItem) {
    setEditingId(item.id)
    setEditForm({
      nom: item.nom,
      quantite: String(item.quantite),
      seuilBas: String(item.seuilBas),
      unite: item.unite,
    })
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
      await apiFetch(getToken, `/api/prestations?resource=stock&id=${id}`, {
        method: 'PATCH',
        body: toBody(editForm),
      })
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
      await apiFetch(getToken, `/api/prestations?resource=stock&id=${id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Impossible de supprimer le produit.')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <p className="text-sm text-text-muted">Suis tes consommables (huiles, serviettes, bougies...) et leur seuil bas.</p>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setFormError(null)
          }}
          className="bg-sage-dark text-white px-4.5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-dark/90 shrink-0"
        >
          Ajouter un produit
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border border-border rounded-2xl p-5 mb-5 flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="block md:col-span-2">
              <span className="block text-xs font-semibold text-text-muted mb-1">Nom du produit *</span>
              <input
                type="text"
                value={form.nom}
                onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                className="input"
                placeholder="Ex : Huile de massage neutre"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-text-muted mb-1">Quantité *</span>
              <input
                type="number"
                min={0}
                value={form.quantite}
                onChange={(e) => setForm((f) => ({ ...f, quantite: e.target.value }))}
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-text-muted mb-1">Seuil bas *</span>
              <input
                type="number"
                min={0}
                value={form.seuilBas}
                onChange={(e) => setForm((f) => ({ ...f, seuilBas: e.target.value }))}
                className="input"
              />
            </label>
          </div>
          <label className="block max-w-xs">
            <span className="block text-xs font-semibold text-text-muted mb-1">Unité</span>
            <input
              type="text"
              value={form.unite}
              onChange={(e) => setForm((f) => ({ ...f, unite: e.target.value }))}
              placeholder="Ex : flacons, unités..."
              className="input"
            />
          </label>
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
                {['Produit', 'Quantité', 'Seuil bas', 'Statut', ''].map((h) => (
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
              {state.stock.map((item) =>
                editingId === item.id ? (
                  <tr key={item.id} className="bg-sage-pale">
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
                        type="number"
                        min={0}
                        value={editForm.quantite}
                        onChange={(e) => setEditForm((f) => ({ ...f, quantite: e.target.value }))}
                        className="input"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        value={editForm.seuilBas}
                        onChange={(e) => setEditForm((f) => ({ ...f, seuilBas: e.target.value }))}
                        className="input"
                      />
                    </td>
                    <td className="px-4 py-3" colSpan={2}>
                      <div className="flex items-center gap-3 flex-wrap">
                        {formError && <p className="text-xs text-danger">{formError}</p>}
                        <button
                          onClick={() => saveEdit(item.id)}
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
                  <tr key={item.id} className="hover:bg-sage-pale transition-colors">
                    <td className="px-4 py-3.5 border-b border-sage-light text-sm font-semibold">{item.nom}</td>
                    <td className="px-4 py-3.5 border-b border-sage-light text-sm">
                      {item.quantite} {item.unite}
                    </td>
                    <td className="px-4 py-3.5 border-b border-sage-light text-sm text-text-muted">{item.seuilBas}</td>
                    <td className="px-4 py-3.5 border-b border-sage-light">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full inline-block ${stockStatut(item).className}`}>
                        {stockStatut(item).label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 border-b border-sage-light text-right whitespace-nowrap">
                      <button
                        onClick={() => startEdit(item)}
                        className="text-xs font-semibold text-sage-dark hover:underline mr-3"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-xs font-semibold text-danger hover:underline"
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ),
              )}
              {state.stock.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">
                    Aucun produit en stock. Ajoute tes consommables pour suivre leur niveau.
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

export default StockManager
