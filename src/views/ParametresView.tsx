import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { ApiError } from '../lib/api'
import { fetchParametres, saveParametres, JOURS_SEMAINE } from '../lib/parametres'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success' }

function ParametresView() {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [horaires, setHoraires] = useState<Record<string, string>>({})
  const [objectifCa, setObjectifCa] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    fetchParametres(getToken)
      .then((data) => {
        setHoraires(data.horaires)
        setObjectifCa(data.objectifCaMensuel !== null ? String(data.objectifCaMensuel) : '')
        setState({ status: 'success' })
      })
      .catch((error: unknown) => {
        setState({ status: 'error', message: error instanceof ApiError ? error.message : 'Erreur inconnue.' })
      })
  }, [getToken])

  useEffect(() => {
    load()
  }, [load])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)
    setSaved(false)
    const objectifNum = objectifCa.trim() === '' ? null : Number(objectifCa)
    if (objectifNum !== null && (!Number.isFinite(objectifNum) || objectifNum < 0)) {
      setSaveError("L'objectif de CA doit être un nombre positif.")
      return
    }
    setSaving(true)
    try {
      await saveParametres(getToken, { horaires, objectifCaMensuel: objectifNum })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  if (state.status === 'loading') return <p className="text-sm text-text-muted">Chargement…</p>
  if (state.status === 'error') return <p className="text-sm text-danger">{state.message}</p>

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-2xl">
      <div className="bg-white border border-border rounded-2xl p-5">
        <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Horaires d'ouverture</h3>
        <p className="text-xs text-text-muted mb-4">
          Ex : « 9h00 – 19h00 ». Laisse vide pour un jour fermé.
        </p>
        <div className="flex flex-col gap-2.5">
          {JOURS_SEMAINE.map((jour) => (
            <div key={jour} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-sm text-text-muted">{jour}</span>
              <input
                type="text"
                value={horaires[jour] ?? ''}
                onChange={(e) => setHoraires((h) => ({ ...h, [jour]: e.target.value }))}
                placeholder="Fermé"
                maxLength={50}
                className="input"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-border rounded-2xl p-5">
        <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Objectif de chiffre d'affaires</h3>
        <p className="text-xs text-text-muted mb-4">
          Une alerte t'informera sur le tableau de bord lorsque ce montant est atteint dans le mois.
        </p>
        <label className="block max-w-xs">
          <span className="block text-xs font-semibold text-text-muted mb-1">Objectif mensuel (€)</span>
          <input
            type="number"
            min={0}
            value={objectifCa}
            onChange={(e) => setObjectifCa(e.target.value)}
            placeholder="Ex : 3000"
            className="input"
          />
        </label>
      </div>

      {saveError && <p className="text-sm text-danger">{saveError}</p>}
      {saved && <p className="text-sm text-sage-dark font-semibold">Paramètres enregistrés.</p>}

      <div>
        <button
          type="submit"
          disabled={saving}
          className="bg-sage-dark text-white px-5 py-2.5 rounded-[10px] text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}

export default ParametresView
