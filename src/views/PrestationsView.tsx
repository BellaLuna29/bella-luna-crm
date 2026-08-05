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
  couleur: string | null
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
  estSerie: boolean
  nbSeances: string
  type: string
  couleurActive: boolean
  couleur: string
}

const DEFAULT_COULEUR = '#6F8E72'
const CURE_RE = /^cure\s+(\d+)\s*s[ée]ances?$/i

const EMPTY_FORM: FormState = {
  nom: '',
  categorie: '',
  duree: '',
  prix: '',
  estSerie: false,
  nbSeances: '',
  type: '',
  couleurActive: false,
  couleur: DEFAULT_COULEUR,
}

function formStateFromPrestation(p: Prestation): FormState {
  const match = CURE_RE.exec(p.type.trim())
  return {
    nom: p.nom,
    categorie: p.categorie,
    duree: p.duree,
    prix: String(p.prix),
    estSerie: Boolean(match),
    nbSeances: match ? match[1] : '',
    type: match ? '' : p.type,
    couleurActive: Boolean(p.couleur),
    couleur: p.couleur ?? DEFAULT_COULEUR,
  }
}

interface PrestationFieldsProps {
  f: FormState
  setF: (updater: (prev: FormState) => FormState) => void
  categories: string[]
  types: string[]
}

function PrestationFields({ f, setF, categories, types }: PrestationFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-semibold text-text-muted mb-1">Nom de la prestation *</span>
          <input
            type="text"
            value={f.nom}
            onChange={(e) => setF((v) => ({ ...v, nom: e.target.value }))}
            className="input"
            placeholder="Ex : Massage Signature"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-text-muted mb-1">Catégorie</span>
          <input
            type="text"
            list="prestation-categories"
            value={f.categorie}
            onChange={(e) => setF((v) => ({ ...v, categorie: e.target.value }))}
            className="input"
            placeholder="Ex : Massages Relaxants"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-semibold text-text-muted mb-1">Durée d'une séance</span>
          <input
            type="text"
            value={f.duree}
            onChange={(e) => setF((v) => ({ ...v, duree: e.target.value }))}
            className="input"
            placeholder="Ex : 1h15, 45min"
          />
          <p className="text-[11px] text-text-muted mt-0.5">
            Durée d'UNE séance, même pour une série. Laisse vide si tu ne sais pas — tu pourras le remplir plus tard.
          </p>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-text-muted mb-1">Prix (€) *</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={f.prix}
            onChange={(e) => setF((v) => ({ ...v, prix: e.target.value }))}
            className="input"
          />
          {f.estSerie && (
            <p className="text-[11px] text-text-muted mt-0.5">Prix du forfait complet, pas d'une seule séance.</p>
          )}
        </label>
      </div>

      <div className="bg-sage-pale rounded-[10px] p-3">
        <span className="block text-xs font-semibold text-text-muted mb-2">
          Séance unique ou série (cure/passeport) ?
        </span>
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              checked={!f.estSerie}
              onChange={() => setF((v) => ({ ...v, estSerie: false }))}
              className="w-4 h-4"
            />
            Séance unique
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              checked={f.estSerie}
              onChange={() => setF((v) => ({ ...v, estSerie: true }))}
              className="w-4 h-4"
            />
            Série (cure / passeport)
          </label>
          {f.estSerie && (
            <label className="flex items-center gap-1.5 text-sm">
              <span className="text-xs text-text-muted">Nombre de séances</span>
              <input
                type="number"
                min={2}
                value={f.nbSeances}
                onChange={(e) => setF((v) => ({ ...v, nbSeances: e.target.value }))}
                className="input max-w-20"
              />
            </label>
          )}
        </div>
        {!f.estSerie && (
          <label className="block mt-2">
            <span className="block text-xs font-semibold text-text-muted mb-1">Type (optionnel)</span>
            <input
              type="text"
              list="prestation-types"
              value={f.type}
              onChange={(e) => setF((v) => ({ ...v, type: e.target.value }))}
              className="input max-w-xs"
              placeholder="Ex : Consultation, Dépose, Remplissage..."
            />
            <datalist id="prestation-types">
              {types.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={f.couleurActive}
          onChange={(e) => setF((v) => ({ ...v, couleurActive: e.target.checked }))}
          className="w-4 h-4"
        />
        Couleur personnalisée dans l'agenda
      </label>
      {f.couleurActive && (
        <label className="flex items-center gap-2">
          <input
            type="color"
            value={f.couleur}
            onChange={(e) => setF((v) => ({ ...v, couleur: e.target.value }))}
            className="w-10 h-8 rounded border border-border cursor-pointer"
          />
          <span className="text-xs text-text-muted">Couleur des rendez-vous de cette prestation dans l'agenda</span>
        </label>
      )}

      <datalist id="prestation-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  )
}

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
      types: Array.from(new Set(state.prestations.map((p) => p.type).filter((t) => t && !CURE_RE.test(t)))).sort(),
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
      type: f.estSerie ? `Cure ${f.nbSeances.trim()} séances` : f.type.trim(),
      couleur: f.couleurActive && f.couleur ? f.couleur : null,
    }
  }

  function validate(f: FormState): string | null {
    if (!f.nom.trim()) return 'Le nom de la prestation est obligatoire.'
    const prix = Number(f.prix)
    if (!Number.isFinite(prix) || prix < 0) return 'Le prix doit être un nombre positif.'
    if (f.estSerie) {
      const n = Number(f.nbSeances)
      if (!Number.isInteger(n) || n < 2) return 'Le nombre de séances de la série doit être un entier d\'au moins 2.'
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
    setEditForm(formStateFromPrestation(p))
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
          <PrestationFields f={form} setF={setForm} categories={categories} types={types} />
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
                {['', 'Prestation', 'Catégorie', 'Durée', 'Prix', 'Type', ''].map((h, i) => (
                  <th
                    key={i}
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
                    <td colSpan={7} className="px-4 py-4">
                      <div className="flex flex-col gap-3 max-w-2xl">
                        <PrestationFields f={editForm} setF={setEditForm} categories={categories} types={types} />
                        {formError && <p className="text-xs text-danger">{formError}</p>}
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 rounded-[8px] text-xs font-semibold text-text-muted hover:bg-white"
                          >
                            Annuler
                          </button>
                          <button
                            onClick={() => saveEdit(p.id)}
                            disabled={saving}
                            className="bg-sage-dark text-white px-3.5 py-1.5 rounded-[8px] text-xs font-semibold disabled:opacity-50"
                          >
                            {saving ? 'Enregistrement…' : 'Enregistrer'}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} className="hover:bg-sage-pale transition-colors">
                    <td className="pl-4 py-3.5 border-b border-sage-light">
                      <span
                        className="block w-3 h-3 rounded-full border border-border/50"
                        style={{ backgroundColor: p.couleur ?? '#D9D2C4' }}
                        title={p.couleur ? 'Couleur personnalisée' : 'Couleur automatique'}
                      />
                    </td>
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
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-text-muted">
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
