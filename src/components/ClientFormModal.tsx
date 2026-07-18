import { useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'

export interface ClientFormValues {
  nomComplet: string
  telephone: string
  email: string
  dateNaissance: string
  metier: string
  categorieMetier: string
  hobbies: string
  notes: string
  statut: string
  newsletter: boolean
}

const EMPTY_VALUES: ClientFormValues = {
  nomComplet: '',
  telephone: '',
  email: '',
  dateNaissance: '',
  metier: '',
  categorieMetier: '',
  hobbies: '',
  notes: '',
  statut: 'Nouvelle',
  newsletter: false,
}

interface ClientFormModalProps {
  mode: 'create' | 'edit'
  clientId?: string
  initialValues?: Partial<ClientFormValues>
  onClose: () => void
  onSaved: () => void
}

function ClientFormModal({ mode, clientId, initialValues, onClose, onSaved }: ClientFormModalProps) {
  const { getToken } = useAuth()
  const [values, setValues] = useState<ClientFormValues>({ ...EMPTY_VALUES, ...initialValues })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function set<K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (values.nomComplet.trim().length === 0) {
      setError('Le nom complet est obligatoire.')
      return
    }

    setSaving(true)
    try {
      const body = {
        nomComplet: values.nomComplet.trim(),
        telephone: values.telephone.trim(),
        email: values.email.trim(),
        dateNaissance: values.dateNaissance || null,
        metier: values.metier.trim(),
        categorieMetier: values.categorieMetier,
        hobbies: values.hobbies.trim(),
        notes: values.notes.trim(),
        statut: values.statut,
        newsletter: values.newsletter,
      }

      if (mode === 'create') {
        await apiFetch(getToken, '/api/clients', { method: 'POST', body })
      } else {
        await apiFetch(getToken, `/api/clients/${clientId}`, { method: 'PATCH', body })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <h3 className="font-serif text-xl font-semibold text-sage-dark mb-4">
          {mode === 'create' ? 'Nouvelle cliente' : 'Modifier la fiche'}
        </h3>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Nom complet *">
            <input
              type="text"
              value={values.nomComplet}
              onChange={(e) => set('nomComplet', e.target.value)}
              maxLength={200}
              required
              className="input"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Téléphone">
              <input
                type="tel"
                value={values.telephone}
                onChange={(e) => set('telephone', e.target.value)}
                maxLength={30}
                className="input"
              />
            </Field>
            <Field label="E-mail">
              <input
                type="email"
                value={values.email}
                onChange={(e) => set('email', e.target.value)}
                maxLength={200}
                className="input"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date de naissance">
              <input
                type="date"
                value={values.dateNaissance}
                onChange={(e) => set('dateNaissance', e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Métier">
              <input
                type="text"
                value={values.metier}
                onChange={(e) => set('metier', e.target.value)}
                maxLength={200}
                className="input"
              />
            </Field>
          </div>

          <Field label="Catégorie de métier">
            <select
              value={values.categorieMetier}
              onChange={(e) => set('categorieMetier', e.target.value)}
              className="input"
            >
              <option value="">Non renseignée</option>
              <option value="Médecine">Médecine</option>
              <option value="Sport">Sport</option>
              <option value="Métier extérieur">Métier extérieur</option>
              <option value="Métier de bureau">Métier de bureau</option>
              <option value="Commerce">Commerce</option>
              <option value="Artisanat">Artisanat</option>
              <option value="Autre">Autre</option>
            </select>
          </Field>

          <Field label="Hobbies / Sport">
            <input
              type="text"
              value={values.hobbies}
              onChange={(e) => set('hobbies', e.target.value)}
              maxLength={200}
              placeholder="Ex : tennis, course à pied, yoga..."
              className="input"
            />
          </Field>

          <Field label="Statut">
            <select
              value={values.statut}
              onChange={(e) => set('statut', e.target.value)}
              className="input"
            >
              <option value="Nouvelle">Nouvelle</option>
              <option value="Régulière">Régulière</option>
              <option value="Inactive">Inactive</option>
            </select>
          </Field>

          <Field label="Note personnelle">
            <textarea
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              maxLength={5000}
              rows={4}
              className="input resize-y"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.newsletter}
              onChange={(e) => set('newsletter', e.target.checked)}
              className="w-4 h-4"
            />
            Inscrite à la newsletter
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

export default ClientFormModal
