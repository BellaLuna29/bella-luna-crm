import { useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import Modal from './Modal'

interface AbsenceFormModalProps {
  initialDate?: string
  onClose: () => void
  onSaved: () => void
}

const TYPE_OPTIONS = ['Vacances', 'Jour off', 'Autre'] as const

function AbsenceFormModal({ initialDate, onClose, onSaved }: AbsenceFormModalProps) {
  const { getToken } = useAuth()
  const [libelle, setLibelle] = useState('')
  const [dateDebut, setDateDebut] = useState(initialDate ?? '')
  const [dateFin, setDateFin] = useState(initialDate ?? '')
  const [type, setType] = useState<(typeof TYPE_OPTIONS)[number]>('Vacances')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!libelle.trim() || !dateDebut || !dateFin) {
      setError('Libellé, date de début et date de fin sont obligatoires.')
      return
    }
    if (dateFin < dateDebut) {
      setError('La date de fin doit être après la date de début.')
      return
    }

    setSaving(true)
    try {
      await apiFetch(getToken, '/api/absences', {
        method: 'POST',
        body: { libelle: libelle.trim(), dateDebut, dateFin, type },
      })
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal size="md">
      <h3 className="font-serif text-xl font-semibold text-sage-dark mb-4">Poser une absence</h3>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="block">
          <span className="block text-xs font-semibold text-text-muted mb-1">Libellé *</span>
          <input
            type="text"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder="Ex : Vacances d'été"
            className="input"
            required
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-text-muted mb-1">Date début *</span>
            <input
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              className="input"
              required
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-text-muted mb-1">Date fin *</span>
            <input
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              className="input"
              required
            />
          </label>
        </div>

        <label className="block">
          <span className="block text-xs font-semibold text-text-muted mb-1">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as (typeof TYPE_OPTIONS)[number])} className="input">
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>

        <p className="text-xs text-text-muted">
          Cette absence s'affichera dans l'agenda à titre indicatif — elle n'empêche pas la prise de rendez-vous.
        </p>

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

export default AbsenceFormModal
