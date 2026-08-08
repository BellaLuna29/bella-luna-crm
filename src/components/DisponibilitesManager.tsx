import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import { useToast } from './ToastProvider'
import Modal from './Modal'

interface Disponibilite {
  id: string
  jourSemaine: number
  actif: boolean
  heureDebut: string
  heureFin: string
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; disponibilites: Disponibilite[] }

const JOUR_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const JOUR_ORDER = [1, 2, 3, 4, 5, 6, 0]

function DisponibilitesManager() {
  const { getToken } = useAuth()
  const { showToast } = useToast()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [savingDay, setSavingDay] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lienToken, setLienToken] = useState<string | null>(null)
  const [showRegenConfirm, setShowRegenConfirm] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    apiFetch<{ disponibilites: Disponibilite[] }>(getToken, '/api/prestations?resource=disponibilites')
      .then((data) => setState({ status: 'success', disponibilites: data.disponibilites }))
      .catch((err: unknown) => {
        setState({ status: 'error', message: err instanceof ApiError ? err.message : 'Erreur inconnue.' })
      })
  }, [getToken])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    apiFetch<{ token: string }>(getToken, '/api/prestations?resource=reservation-token')
      .then((data) => setLienToken(data.token))
      .catch(() => {
        // link section just stays hidden — not worth surfacing a separate error banner
      })
  }, [getToken])

  async function regenererLien() {
    setRegenerating(true)
    try {
      const data = await apiFetch<{ token: string }>(getToken, '/api/prestations?resource=reservation-token', {
        method: 'POST',
      })
      setLienToken(data.token)
      setShowRegenConfirm(false)
      showToast('Nouveau lien généré — l\'ancien ne fonctionne plus.')
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Impossible de régénérer le lien.', 'error')
    } finally {
      setRegenerating(false)
    }
  }

  async function saveDay(jourSemaine: number, updates: { actif?: boolean; heureDebut?: string; heureFin?: string }) {
    setError(null)
    setSavingDay(jourSemaine)
    try {
      await apiFetch(getToken, `/api/prestations?resource=disponibilites&jour=${jourSemaine}`, {
        method: 'PATCH',
        body: updates,
      })
      load()
      showToast('Disponibilités mises à jour.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setSavingDay(null)
    }
  }

  if (state.status === 'loading') return <p className="text-sm text-text-muted">Chargement…</p>
  if (state.status === 'error') return <p className="text-sm text-danger">{state.message}</p>

  const byJour = new Map(state.disponibilites.map((d) => [d.jourSemaine, d]))

  const lienReservation = lienToken ? `${window.location.origin}/reserver/${lienToken}` : null

  function copierLien() {
    if (!lienReservation) return
    navigator.clipboard
      .writeText(lienReservation)
      .then(() => showToast('Lien copié.'))
      .catch(() => showToast("Impossible de copier le lien.", 'error'))
  }

  return (
    <div>
      <p className="text-xs text-text-muted mb-4">
        Indique tes jours et horaires de disponibilité habituels — c'est ce que voient tes clientes sur la page de
        réservation en ligne. Une fois qu'une demande arrive, elle apparaît dans l'agenda en « En attente » : tu
        l'assignes à la bonne cliente ou tu l'annules, rien n'est confirmé automatiquement.
      </p>
      <div className="bg-sage-pale rounded-[10px] p-3 mb-4 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-sage-dark shrink-0">Lien à partager :</span>
        <code className="text-xs text-text-muted break-all flex-1">{lienReservation ?? 'Chargement…'}</code>
        <button
          type="button"
          onClick={copierLien}
          disabled={!lienReservation}
          className="bg-white border border-border text-sage-dark px-3 py-1.5 rounded-[8px] text-xs font-semibold hover:bg-white/70 shrink-0 disabled:opacity-50"
        >
          Copier
        </button>
        <button
          type="button"
          onClick={() => setShowRegenConfirm(true)}
          disabled={!lienReservation}
          className="text-danger px-3 py-1.5 rounded-[8px] text-xs font-semibold hover:bg-danger-pale shrink-0 disabled:opacity-50"
        >
          Changer le lien
        </button>
      </div>
      {error && <p className="text-sm text-danger mb-3">{error}</p>}
      {showRegenConfirm && (
        <Modal size="sm">
          <h3 className="font-serif text-xl font-semibold text-sage-dark mb-3">Changer le lien de réservation ?</h3>
          <p className="text-sm text-text-muted mb-4">
            Un nouveau lien sera généré et l'ancien arrêtera de fonctionner immédiatement — utile s'il a été partagé
            trop largement ou reçoit des demandes suspectes. Pense à repartager le nouveau lien.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowRegenConfirm(false)}
              className="px-4 py-2.5 rounded-[10px] text-sm font-semibold text-text-muted hover:bg-sage-pale"
            >
              Annuler
            </button>
            <button
              onClick={regenererLien}
              disabled={regenerating}
              className="bg-danger text-white px-5 py-2.5 rounded-[10px] text-sm font-semibold disabled:opacity-50"
            >
              {regenerating ? 'Génération…' : 'Changer le lien'}
            </button>
          </div>
        </Modal>
      )}
      <div className="flex flex-col gap-2">
        {JOUR_ORDER.map((jour) => {
          const d = byJour.get(jour)
          if (!d) return null
          const busy = savingDay === jour
          return (
            <div key={jour} className="flex items-center gap-3 flex-wrap bg-sage-pale rounded-[10px] px-3 py-2.5">
              <label className="flex items-center gap-2 text-sm font-semibold text-sage-dark w-32 shrink-0">
                <input
                  type="checkbox"
                  checked={d.actif}
                  disabled={busy}
                  onChange={(e) => saveDay(jour, { actif: e.target.checked })}
                  className="w-4 h-4"
                />
                {JOUR_LABELS[jour]}
              </label>
              <input
                type="time"
                value={d.heureDebut}
                disabled={busy || !d.actif}
                onChange={(e) => saveDay(jour, { heureDebut: e.target.value })}
                className="input max-w-32 disabled:opacity-50"
              />
              <span className="text-text-muted text-sm">→</span>
              <input
                type="time"
                value={d.heureFin}
                disabled={busy || !d.actif}
                onChange={(e) => saveDay(jour, { heureFin: e.target.value })}
                className="input max-w-32 disabled:opacity-50"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DisponibilitesManager
