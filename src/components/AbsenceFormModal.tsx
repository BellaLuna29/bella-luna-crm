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
const DEMI_JOURNEE_OPTIONS = [
  { value: '', label: 'Journée entière' },
  { value: 'matin', label: 'Matin' },
  { value: 'apres-midi', label: 'Après-midi' },
] as const

/** Les trois façons de se rendre indisponible, exclusives entre elles. */
type Mode = 'journees' | 'heures' | 'recurrent'
const MODES: { value: Mode; label: string; aide: string }[] = [
  { value: 'journees', label: 'Jours', aide: 'Une ou plusieurs journées, entières ou en demi-journée.' },
  { value: 'heures', label: 'Heures', aide: 'Une plage horaire sur une seule date.' },
  { value: 'recurrent', label: 'Chaque semaine', aide: 'Une plage horaire qui revient le même jour, toutes les semaines.' },
]
const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const JOURS_ORDRE = [1, 2, 3, 4, 5, 6, 0]

function AbsenceFormModal({ initialDate, onClose, onSaved }: AbsenceFormModalProps) {
  const { getToken } = useAuth()
  const [libelle, setLibelle] = useState('')
  const [dateDebut, setDateDebut] = useState(initialDate ?? '')
  const [dateFin, setDateFin] = useState(initialDate ?? '')
  const [type, setType] = useState<(typeof TYPE_OPTIONS)[number]>('Vacances')
  const [demiJournee, setDemiJournee] = useState('')
  const [mode, setMode] = useState<Mode>('journees')
  const [heureDebut, setHeureDebut] = useState('12:00')
  const [heureFin, setHeureFin] = useState('14:00')
  const [jourSemaine, setJourSemaine] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isSingleDay = dateDebut !== '' && dateDebut === dateFin

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!libelle.trim()) {
      setError('Le libellé est obligatoire.')
      return
    }
    if (mode !== 'recurrent') {
      if (!dateDebut || !dateFin) {
        setError('La date de début et la date de fin sont obligatoires.')
        return
      }
      if (dateFin < dateDebut) {
        setError('La date de fin doit être après la date de début.')
        return
      }
    }
    if (mode !== 'journees' && heureDebut >= heureFin) {
      setError("L'heure de fin doit être après l'heure de début.")
      return
    }

    // Une récurrence hebdomadaire n'a pas de période : on enregistre la date du
    // jour pour satisfaire le schéma, le calcul des créneaux ne la lit pas.
    const aujourdhui = new Date().toISOString().slice(0, 10)
    const corps =
      mode === 'journees'
        ? {
            libelle: libelle.trim(),
            dateDebut,
            dateFin,
            type,
            demiJournee: isSingleDay ? demiJournee || null : null,
            heureDebut: null,
            heureFin: null,
            recurrence: null,
          }
        : mode === 'heures'
          ? {
              libelle: libelle.trim(),
              dateDebut,
              dateFin: dateDebut,
              type,
              demiJournee: null,
              heureDebut,
              heureFin,
              recurrence: null,
            }
          : {
              libelle: libelle.trim(),
              dateDebut: aujourdhui,
              dateFin: aujourdhui,
              type,
              demiJournee: null,
              heureDebut,
              heureFin,
              recurrence: 'hebdomadaire',
              jourSemaine,
            }

    setSaving(true)
    try {
      await apiFetch(getToken, '/api/absences', { method: 'POST', body: corps })
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

        <div>
          <span className="block text-xs font-semibold text-text-muted mb-1">Ce que tu bloques</span>
          <div className="flex items-center bg-sage-pale rounded-[10px] p-0.5">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={`flex-1 h-9 rounded-[8px] text-sm font-semibold ${
                  mode === m.value ? 'bg-sage-dark text-white' : 'text-text-muted'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-text-muted mt-1.5">
            {MODES.find((m) => m.value === mode)?.aide}
          </p>
        </div>

        {mode === 'journees' && (
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
        )}

        {mode === 'heures' && (
          <label className="block">
            <span className="block text-xs font-semibold text-text-muted mb-1">Date *</span>
            <input
              type="date"
              value={dateDebut}
              onChange={(e) => {
                setDateDebut(e.target.value)
                setDateFin(e.target.value)
              }}
              className="input"
              required
            />
          </label>
        )}

        {mode === 'recurrent' && (
          <label className="block">
            <span className="block text-xs font-semibold text-text-muted mb-1">Chaque *</span>
            <select
              value={jourSemaine}
              onChange={(e) => setJourSemaine(Number(e.target.value))}
              className="input"
            >
              {JOURS_ORDRE.map((j) => (
                <option key={j} value={j}>
                  {JOURS[j]}
                </option>
              ))}
            </select>
          </label>
        )}

        {mode !== 'journees' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-text-muted mb-1">De *</span>
              <input
                type="time"
                value={heureDebut}
                onChange={(e) => setHeureDebut(e.target.value)}
                className="input"
                required
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-text-muted mb-1">À *</span>
              <input
                type="time"
                value={heureFin}
                onChange={(e) => setHeureFin(e.target.value)}
                className="input"
                required
              />
            </label>
          </div>
        )}

        {mode === 'journees' && isSingleDay && (
          <label className="block">
            <span className="block text-xs font-semibold text-text-muted mb-1">Durée</span>
            <select value={demiJournee} onChange={(e) => setDemiJournee(e.target.value)} className="input">
              {DEMI_JOURNEE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}

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
          Ce blocage s'affiche dans l'agenda et empêche tes clientes de réserver en ligne sur ce créneau. Tu peux
          quand même y ajouter toi-même un rendez-vous si besoin.
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
