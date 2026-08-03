import { useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import Modal from './Modal'

const CATEGORIE_SUGGESTIONS = [
  'Loyer-local',
  'Assurance',
  'Consommables',
  'Communication',
  'Formation',
  'Matériel',
  'Autre',
]

interface DepenseFormModalProps {
  onClose: () => void
  onSaved: () => void
}

function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // strip the "data:<type>;base64," prefix
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function DepenseFormModal({ onClose, onSaved }: DepenseFormModalProps) {
  const { getToken } = useAuth()
  const [date, setDate] = useState(todayIso())
  const [categorie, setCategorie] = useState('')
  const [description, setDescription] = useState('')
  const [montant, setMontant] = useState('')
  const [recurrente, setRecurrente] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const montantNum = Number(montant)
    if (!date || description.trim().length === 0 || montant.trim().length === 0 || Number.isNaN(montantNum) || montantNum < 0) {
      setError('Date, description et montant (positif) sont obligatoires.')
      return
    }
    if (file && file.type !== 'application/pdf') {
      setError('Le justificatif doit être un fichier PDF.')
      return
    }
    if (file && file.size > 4 * 1024 * 1024) {
      setError('Le fichier est trop volumineux (4 Mo maximum).')
      return
    }

    setSaving(true)
    try {
      const { id } = await apiFetch<{ id: string }>(getToken, '/api/depenses', {
        method: 'POST',
        body: {
          date,
          categorie: categorie.trim(),
          description: description.trim(),
          montant: montantNum,
          recurrente,
        },
      })

      if (file) {
        const dataBase64 = await fileToBase64(file)
        await apiFetch(getToken, `/api/depenses/${id}/justificatif`, {
          method: 'POST',
          body: { filename: file.name, contentType: file.type, dataBase64 },
        })
      }

      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal size="md">
      <h3 className="font-serif text-xl font-semibold text-sage-dark mb-4">Nouvelle dépense</h3>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date *">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="input" />
          </Field>
          <Field label="Montant (€) *">
            <input
              type="number"
              min={0}
              step="0.01"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              required
              className="input"
            />
          </Field>
        </div>

        <Field label="Catégorie">
          <input
            type="text"
            list="categorie-suggestions"
            value={categorie}
            onChange={(e) => setCategorie(e.target.value)}
            placeholder="Ex : Loyer-local, Assurance..."
            maxLength={100}
            className="input"
          />
          <datalist id="categorie-suggestions">
            {CATEGORIE_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>

        <Field label="Description *">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            required
            className="input"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={recurrente}
            onChange={(e) => setRecurrente(e.target.checked)}
            className="w-4 h-4"
          />
          Dépense récurrente (mensuelle)
        </label>

        <Field label="Justificatif (PDF)">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="input"
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

export default DepenseFormModal
