import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import SearchableSelect from './SearchableSelect'

interface ClientOption {
  id: string
  nomComplet: string
}

interface NewClientResponse {
  client: { id: string; nomComplet: string }
}

interface PrestationOption {
  id: string
  nom: string
  categorie: string
  prix: number
}

export interface RdvFormInitial {
  clienteId: string
  prestationId: string
  date: string // yyyy-MM-ddTHH:mm (local, for <input type="datetime-local">)
  statut: string
  notes: string
}

interface RdvFormModalProps {
  mode: 'create' | 'edit'
  rdvId?: string
  initialValues?: Partial<RdvFormInitial>
  onClose: () => void
  onSaved: () => void
}

const EMPTY: RdvFormInitial = {
  clienteId: '',
  prestationId: '',
  date: '',
  statut: 'Confirmé',
  notes: '',
}

function RdvFormModal({ mode, rdvId, initialValues, onClose, onSaved }: RdvFormModalProps) {
  const { getToken } = useAuth()
  const [values, setValues] = useState<RdvFormInitial>({ ...EMPTY, ...initialValues })
  const [clients, setClients] = useState<ClientOption[] | null>(null)
  const [prestations, setPrestations] = useState<PrestationOption[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showQuickCreate, setShowQuickCreate] = useState(false)
  const [quickNom, setQuickNom] = useState('')
  const [quickTelephone, setQuickTelephone] = useState('')
  const [quickError, setQuickError] = useState<string | null>(null)
  const [quickCreating, setQuickCreating] = useState(false)

  useEffect(() => {
    Promise.all([
      apiFetch<{ clients: ClientOption[] }>(getToken, '/api/clients'),
      apiFetch<{ prestations: PrestationOption[] }>(getToken, '/api/prestations'),
    ])
      .then(([clientsData, prestationsData]) => {
        setClients(clientsData.clients)
        setPrestations(prestationsData.prestations)
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
      })
  }, [getToken])

  function set<K extends keyof RdvFormInitial>(key: K, value: RdvFormInitial[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleQuickCreate() {
    setQuickError(null)
    if (quickNom.trim().length === 0) {
      setQuickError('Le nom complet est obligatoire.')
      return
    }
    setQuickCreating(true)
    try {
      const data = await apiFetch<NewClientResponse>(getToken, '/api/clients', {
        method: 'POST',
        body: { nomComplet: quickNom.trim(), telephone: quickTelephone.trim() },
      })
      setClients((prev) => [...(prev ?? []), { id: data.client.id, nomComplet: data.client.nomComplet }])
      set('clienteId', data.client.id)
      setShowQuickCreate(false)
      setQuickNom('')
      setQuickTelephone('')
    } catch (err) {
      setQuickError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setQuickCreating(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!values.clienteId || !values.prestationId || !values.date) {
      setError('Cliente, prestation et date/heure sont obligatoires.')
      return
    }

    setSaving(true)
    try {
      const body = {
        clienteId: values.clienteId,
        prestationId: values.prestationId,
        date: new Date(values.date).toISOString(),
        statut: values.statut,
        notes: values.notes.trim(),
      }

      if (mode === 'create') {
        await apiFetch(getToken, '/api/rendezvous', { method: 'POST', body })
      } else {
        await apiFetch(getToken, `/api/rendezvous/${rdvId}`, { method: 'PATCH', body })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  const loading = !clients || !prestations

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <h3 className="font-serif text-xl font-semibold text-sage-dark mb-4">
          {mode === 'create' ? 'Nouveau rendez-vous' : 'Modifier le rendez-vous'}
        </h3>

        {loadError && <p className="text-sm text-danger mb-4">{loadError}</p>}

        {loading && !loadError && (
          <p className="text-sm text-text-muted">Chargement…</p>
        )}

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
              {!showQuickCreate ? (
                <button
                  type="button"
                  onClick={() => setShowQuickCreate(true)}
                  className="mt-1.5 text-xs font-semibold text-sage-dark hover:underline"
                >
                  + Nouvelle cliente rapide
                </button>
              ) : (
                <div className="mt-2 bg-sage-pale rounded-[10px] p-3 flex flex-col gap-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={quickNom}
                      onChange={(e) => setQuickNom(e.target.value)}
                      placeholder="Nom complet *"
                      maxLength={200}
                      className="input"
                    />
                    <input
                      type="tel"
                      value={quickTelephone}
                      onChange={(e) => setQuickTelephone(e.target.value)}
                      placeholder="Téléphone (optionnel)"
                      maxLength={30}
                      className="input"
                    />
                  </div>
                  <p className="text-[11px] text-text-muted">
                    Tu pourras compléter sa fiche (santé, questionnaire...) plus tard.
                  </p>
                  {quickError && <p className="text-xs text-danger">{quickError}</p>}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowQuickCreate(false)
                        setQuickError(null)
                      }}
                      className="px-3 py-1.5 rounded-[8px] text-xs font-semibold text-text-muted hover:bg-white"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={handleQuickCreate}
                      disabled={quickCreating}
                      className="bg-sage-dark text-white px-3.5 py-1.5 rounded-[8px] text-xs font-semibold disabled:opacity-50"
                    >
                      {quickCreating ? 'Création…' : 'Créer'}
                    </button>
                  </div>
                </div>
              )}
            </Field>

            <Field label="Prestation *">
              <SearchableSelect
                options={prestations!.map((p) => ({
                  id: p.id,
                  label: p.nom,
                  sublabel: `${p.prix} €`,
                }))}
                value={values.prestationId}
                onChange={(id) => set('prestationId', id)}
                placeholder="Rechercher une prestation..."
                emptyLabel="Aucune prestation trouvée."
              />
            </Field>

            <Field label="Date et heure *">
              <input
                type="datetime-local"
                value={values.date}
                onChange={(e) => set('date', e.target.value)}
                required
                className="input"
              />
            </Field>

            <Field label="Statut">
              <select
                value={values.statut}
                onChange={(e) => set('statut', e.target.value)}
                className="input"
              >
                <option value="Confirmé">Confirmé</option>
                <option value="Honoré">Honoré</option>
                <option value="Annulé">Annulé</option>
              </select>
            </Field>

            <Field label="Notes">
              <textarea
                value={values.notes}
                onChange={(e) => set('notes', e.target.value)}
                maxLength={5000}
                rows={3}
                className="input resize-y"
              />
            </Field>

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
      </div>
    </div>
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

export default RdvFormModal
