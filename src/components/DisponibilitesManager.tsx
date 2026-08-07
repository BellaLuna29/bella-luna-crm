import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import { useToast } from './ToastProvider'

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

  return (
    <div>
      <p className="text-xs text-text-muted mb-4">
        Prépare le terrain pour une future page de réservation en ligne : indique tes jours et horaires de
        disponibilité habituels. Ce n'est pas encore visible par tes clientes — juste une base à réutiliser plus
        tard.
      </p>
      {error && <p className="text-sm text-danger mb-3">{error}</p>}
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
