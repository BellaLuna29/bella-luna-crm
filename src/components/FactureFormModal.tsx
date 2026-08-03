import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import SearchableSelect from './SearchableSelect'
import Modal from './Modal'

interface ClientOption {
  id: string
  nomComplet: string
}

interface PromoOption {
  id: string
  nom: string
  reduction: number | null
  active: boolean
}

interface PrestationOption {
  id: string
  nom: string
  prix: number
}

export interface FactureFormInitial {
  clienteId: string
  montant: string
  dateFacture: string
  payee: boolean
  categorieFacture: (typeof CATEGORIE_FACTURE_OPTIONS)[number]
  promoId: string
  description: string
  notes: string
}

interface FactureFormModalProps {
  mode: 'create' | 'edit'
  factureId?: string
  initialValues?: Partial<FactureFormInitial>
  onClose: () => void
  onSaved: () => void
}

const CATEGORIE_FACTURE_OPTIONS = ['Commercial', 'Associatif ou formation'] as const

function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const EMPTY: FactureFormInitial = {
  clienteId: '',
  montant: '',
  dateFacture: todayIso(),
  payee: false,
  categorieFacture: 'Commercial',
  promoId: '',
  description: '',
  notes: '',
}

function FactureFormModal({ mode, factureId, initialValues, onClose, onSaved }: FactureFormModalProps) {
  const { getToken } = useAuth()
  const [values, setValues] = useState<FactureFormInitial>({ ...EMPTY, ...initialValues })
  const [clients, setClients] = useState<ClientOption[] | null>(null)
  const [promos, setPromos] = useState<PromoOption[] | null>(null)
  const [prestations, setPrestations] = useState<PrestationOption[] | null>(null)
  const [prestationId, setPrestationId] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiFetch<{ clients: ClientOption[] }>(getToken, '/api/clients')
      .then((data) => setClients(data.clients))
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
      })
    apiFetch<{ promotions: PromoOption[] }>(getToken, '/api/prestations?resource=promotions')
      .then((data) => setPromos(data.promotions))
      .catch(() => setPromos([]))
    apiFetch<{ prestations: PrestationOption[] }>(getToken, '/api/prestations')
      .then((data) => setPrestations(data.prestations))
      .catch(() => setPrestations([]))
  }, [getToken])

  function set<K extends keyof FactureFormInitial>(key: K, value: FactureFormInitial[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function applyPrestation(id: string) {
    setPrestationId(id)
    const p = prestations?.find((item) => item.id === id)
    if (p) {
      set('description', p.nom)
      set('montant', String(p.prix))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const montantNum = Number(values.montant)
    if (
      !values.clienteId ||
      !values.dateFacture ||
      values.montant.trim().length === 0 ||
      Number.isNaN(montantNum) ||
      montantNum < 0
    ) {
      setError('Cliente, montant (positif) et date sont obligatoires.')
      return
    }

    setSaving(true)
    try {
      const body = {
        clienteId: values.clienteId,
        montant: montantNum,
        dateFacture: values.dateFacture,
        payee: values.payee,
        categorieFacture: values.categorieFacture,
        promoId: values.promoId || null,
        description: values.description.trim(),
        notes: values.notes.trim(),
      }
      if (mode === 'create') {
        await apiFetch(getToken, '/api/factures', { method: 'POST', body })
      } else {
        await apiFetch(getToken, `/api/factures/${factureId}`, { method: 'PATCH', body })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  const loading = !clients

  return (
    <Modal size="md">
      <h3 className="font-serif text-xl font-semibold text-sage-dark mb-4">
        {mode === 'create' ? 'Nouvelle facture' : 'Modifier la facture'}
      </h3>

      {loadError && <p className="text-sm text-danger mb-4">{loadError}</p>}
      {loading && !loadError && <p className="text-sm text-text-muted">Chargement…</p>}

      {!loading && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Cliente *">
            <SearchableSelect
              options={clients!.map((c) => ({ id: c.id, label: c.nomComplet }))}
              value={values.clienteId}
              onChange={(id) => set('clienteId', id)}
              placeholder="Rechercher une cliente..."
              emptyLabel="Aucune cliente trouvée."
            />
          </Field>

          <Field label="Prestation du catalogue (optionnel)">
            <SearchableSelect
              options={(prestations ?? []).map((p) => ({ id: p.id, label: p.nom, sublabel: `${p.prix} €` }))}
              value={prestationId}
              onChange={applyPrestation}
              placeholder="Pré-remplir depuis le catalogue..."
              emptyLabel="Aucune prestation trouvée."
            />
            <p className="text-[11px] text-text-muted mt-1">
              Pré-remplit la description et le prix — les deux restent modifiables juste en dessous.
            </p>
          </Field>

          <Field label="Description sur la facture">
            <input
              type="text"
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              maxLength={200}
              placeholder="Ex : Massage Signature, ou tout intitulé libre"
              className="input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Montant (€) *">
              <input
                type="number"
                min={0}
                step="0.01"
                value={values.montant}
                onChange={(e) => set('montant', e.target.value)}
                required
                className="input"
              />
            </Field>
            <Field label="Date de facture *">
              <input
                type="date"
                value={values.dateFacture}
                onChange={(e) => set('dateFacture', e.target.value)}
                required
                className="input"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Catégorie de facture">
              <select
                value={values.categorieFacture}
                onChange={(e) => set('categorieFacture', e.target.value as (typeof CATEGORIE_FACTURE_OPTIONS)[number])}
                className="input"
              >
                {CATEGORIE_FACTURE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Promotion">
              <select value={values.promoId} onChange={(e) => set('promoId', e.target.value)} className="input">
                <option value="">Aucune</option>
                {(promos ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                    {p.reduction ? ` (-${Math.round(p.reduction * 100)}%)` : ''}
                    {!p.active ? ' (inactive)' : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Notes (visibles uniquement par toi)">
            <textarea
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Ex : remise exceptionnelle accordée, paiement en 2 fois..."
              className="input resize-y"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.payee}
              onChange={(e) => set('payee', e.target.checked)}
              className="w-4 h-4"
            />
            Déjà payée
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
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
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-text-muted mb-1">{label}</span>
      {children}
    </label>
  )
}

export default FactureFormModal
