import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'

interface Promotion {
  id: string
  nom: string
  reduction: number | null
  reductionMontant: number | null
  typeReduction: string
  active: boolean
  dateExpiration: string | null
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; promotions: Promotion[] }

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('fr-FR')
}

function formatReduction(p: Promotion): string {
  if (p.typeReduction === 'montant') {
    return p.reductionMontant !== null ? `-${p.reductionMontant} €` : '—'
  }
  return p.reduction !== null ? `-${Math.round(p.reduction * 100)} %` : '—'
}

interface FormState {
  nom: string
  typeReduction: 'pourcentage' | 'montant'
  reductionPct: string
  reductionMontant: string
  dateExpiration: string
  active: boolean
}

const EMPTY_FORM: FormState = {
  nom: '',
  typeReduction: 'pourcentage',
  reductionPct: '',
  reductionMontant: '',
  dateExpiration: '',
  active: true,
}

function promotionToForm(p: Promotion): FormState {
  const typeReduction = p.typeReduction === 'montant' ? 'montant' : 'pourcentage'
  return {
    nom: p.nom,
    typeReduction,
    reductionPct: p.reduction !== null ? String(Math.round(p.reduction * 100)) : '',
    reductionMontant: p.reductionMontant !== null ? String(p.reductionMontant) : '',
    dateExpiration: p.dateExpiration ?? '',
    active: p.active,
  }
}

interface ReductionFieldsProps {
  f: FormState
  setF: (updater: (prev: FormState) => FormState) => void
}

function ReductionFields({ f, setF }: ReductionFieldsProps) {
  return (
    <>
      <label className="block">
        <span className="block text-xs font-semibold text-text-muted mb-1">Type de réduction</span>
        <select
          value={f.typeReduction}
          onChange={(e) => setF((v) => ({ ...v, typeReduction: e.target.value as FormState['typeReduction'] }))}
          className="input"
        >
          <option value="pourcentage">Pourcentage</option>
          <option value="montant">Montant fixe (€)</option>
        </select>
      </label>
      {f.typeReduction === 'pourcentage' ? (
        <label className="block">
          <span className="block text-xs font-semibold text-text-muted mb-1">Réduction (%) *</span>
          <input
            type="number"
            min={1}
            max={100}
            value={f.reductionPct}
            onChange={(e) => setF((v) => ({ ...v, reductionPct: e.target.value }))}
            className="input"
          />
        </label>
      ) : (
        <label className="block">
          <span className="block text-xs font-semibold text-text-muted mb-1">Réduction (€) *</span>
          <input
            type="number"
            min={0.01}
            step="0.01"
            value={f.reductionMontant}
            onChange={(e) => setF((v) => ({ ...v, reductionMontant: e.target.value }))}
            className="input"
          />
        </label>
      )}
    </>
  )
}

function PromotionsManager() {
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
    apiFetch<{ promotions: Promotion[] }>(getToken, '/api/prestations?resource=promotions')
      .then((data) => setState({ status: 'success', promotions: data.promotions }))
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
      typeReduction: f.typeReduction,
      reduction: f.typeReduction === 'pourcentage' ? Number(f.reductionPct) / 100 : undefined,
      reductionMontant: f.typeReduction === 'montant' ? Number(f.reductionMontant) : undefined,
      dateExpiration: f.dateExpiration || null,
      active: f.active,
    }
  }

  function validate(f: FormState): string | null {
    if (!f.nom.trim()) return 'Le nom est obligatoire.'
    if (f.typeReduction === 'pourcentage') {
      const pct = Number(f.reductionPct)
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return 'La réduction doit être un pourcentage entre 1 et 100.'
    } else {
      const montant = Number(f.reductionMontant)
      if (!Number.isFinite(montant) || montant <= 0) return 'Le montant de la réduction doit être un nombre positif.'
    }
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
      await apiFetch(getToken, '/api/prestations?resource=promotions', { method: 'POST', body: toBody(form) })
      setForm(EMPTY_FORM)
      setShowCreate(false)
      load()
    } catch (err2) {
      setFormError(err2 instanceof ApiError ? err2.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(p: Promotion) {
    setEditingId(p.id)
    setEditForm(promotionToForm(p))
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
      await apiFetch(getToken, `/api/prestations?resource=promotions&id=${id}`, {
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

  async function toggleActive(p: Promotion) {
    setRowError(null)
    try {
      await apiFetch(getToken, `/api/prestations?resource=promotions&id=${p.id}`, {
        method: 'PATCH',
        body: { active: !p.active },
      })
      load()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Impossible de mettre à jour le code promo.")
    }
  }

  async function handleDelete(id: string) {
    setRowError(null)
    try {
      await apiFetch(getToken, `/api/prestations?resource=promotions&id=${id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "Impossible de supprimer le code promo.")
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <p className="text-sm text-text-muted">Crée et gère tes codes promo, avec une date d'expiration si besoin.</p>
        <button
          onClick={() => {
            setShowCreate((v) => !v)
            setFormError(null)
          }}
          className="bg-sage-dark text-white px-4.5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-dark/90 shrink-0"
        >
          Créer un code promo
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border border-border rounded-2xl p-5 mb-5 flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-text-muted mb-1">Nom du code *</span>
              <input
                type="text"
                value={form.nom}
                onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                className="input"
                placeholder="Ex : ETE2026"
              />
            </label>
            <ReductionFields f={form} setF={setForm} />
            <label className="block">
              <span className="block text-xs font-semibold text-text-muted mb-1">Date d'expiration</span>
              <input
                type="date"
                value={form.dateExpiration}
                onChange={(e) => setForm((f) => ({ ...f, dateExpiration: e.target.value }))}
                className="input"
              />
            </label>
          </div>
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
                {['Nom', 'Réduction', 'Expiration', 'Statut', ''].map((h) => (
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
              {state.promotions.map((p) =>
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
                    <td className="px-4 py-3" colSpan={2}>
                      <div className="grid grid-cols-2 gap-2 max-w-sm">
                        <ReductionFields f={editForm} setF={setEditForm} />
                      </div>
                    </td>
                    <td className="px-4 py-3" colSpan={2}>
                      <div className="flex items-center gap-3 flex-wrap">
                        {formError && <p className="text-xs text-danger">{formError}</p>}
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
                    <td className="px-4 py-3.5 border-b border-sage-light text-sm">{formatReduction(p)}</td>
                    <td className="px-4 py-3.5 border-b border-sage-light text-sm text-text-muted">
                      {formatDate(p.dateExpiration)}
                    </td>
                    <td className="px-4 py-3.5 border-b border-sage-light">
                      <button
                        onClick={() => toggleActive(p)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full inline-block ${
                          p.active ? 'bg-sage-light text-sage-dark' : 'bg-danger-pale text-danger'
                        }`}
                      >
                        {p.active ? 'Active' : 'Inactive'}
                      </button>
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
              {state.promotions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">
                    Aucun code promo créé.
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

export default PromotionsManager
