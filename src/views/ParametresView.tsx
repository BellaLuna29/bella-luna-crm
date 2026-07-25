import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { ApiError } from '../lib/api'
import { fetchParametres, saveParametres, type Parametres } from '../lib/parametres'
import AlertesView from './AlertesView'
import FormulairesView from './FormulairesView'
import ModelesView from './ModelesView'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success' }

type SubTab = 'general' | 'alertes' | 'formulaires' | 'modeles'

const TABS: { key: SubTab; label: string }[] = [
  { key: 'general', label: 'Général' },
  { key: 'alertes', label: 'Alertes' },
  { key: 'modeles', label: 'Modèles' },
  { key: 'formulaires', label: 'Formulaires' },
]

const SEUIL_FIELDS: { key: keyof Parametres; label: string; hint: string }[] = [
  { key: 'seuilRecontactJours', label: 'Clientes à recontacter', hint: 'Jours sans rendez-vous avant alerte' },
  { key: 'seuilFactureImpayeeJours', label: 'Factures impayées', hint: 'Jours de retard avant alerte' },
  { key: 'seuilPromoExpirationJours', label: 'Codes promo bientôt expirés', hint: "Jours avant l'expiration" },
  { key: 'seuilNewsletterJours', label: 'Newsletter pas envoyée', hint: "Jours sans envoi avant alerte" },
  { key: 'seuilAnniversaireJours', label: 'Anniversaires à venir', hint: "Jours avant l'anniversaire" },
  {
    key: 'seuilInactiviteLongueJours',
    label: 'Inactivité longue (offre de retour)',
    hint: 'Jours sans rendez-vous avant proposition de retour',
  },
]

interface ParametresViewProps {
  onSelectClient: (id: string) => void
  onNavigateFacturation: () => void
  onNavigateNewsletter: () => void
}

function ParametresView({ onSelectClient, onNavigateFacturation, onNavigateNewsletter }: ParametresViewProps) {
  const { getToken } = useAuth()
  const [subTab, setSubTab] = useState<SubTab>('general')
  const [state, setState] = useState<State>({ status: 'loading' })
  const [objectifCa, setObjectifCa] = useState('')
  const [seuils, setSeuils] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    fetchParametres(getToken)
      .then((data) => {
        setObjectifCa(data.objectifCaMensuel !== null ? String(data.objectifCaMensuel) : '')
        setSeuils(Object.fromEntries(SEUIL_FIELDS.map(({ key }) => [key, String(data[key])])))
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

    const seuilUpdates: Partial<Parametres> = {}
    for (const { key, label } of SEUIL_FIELDS) {
      const n = Number(seuils[key])
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        setSaveError(`Le seuil « ${label} » doit être un nombre entier positif.`)
        return
      }
      ;(seuilUpdates as Record<string, number>)[key] = n
    }

    setSaving(true)
    try {
      await saveParametres(getToken, { objectifCaMensuel: objectifNum, ...seuilUpdates })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`px-3.5 py-2 rounded-[10px] text-sm font-semibold transition-colors ${
              subTab === tab.key ? 'bg-sage-dark text-white' : 'bg-white border border-border text-text-muted hover:bg-sage-pale'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'alertes' && (
        <AlertesView
          onSelectClient={onSelectClient}
          onNavigateFacturation={onNavigateFacturation}
          onNavigateNewsletter={onNavigateNewsletter}
        />
      )}

      {subTab === 'modeles' && <ModelesView />}

      {subTab === 'formulaires' && <FormulairesView />}

      {subTab === 'general' && (
        <>
          {state.status === 'loading' && <p className="text-sm text-text-muted">Chargement…</p>}
          {state.status === 'error' && <p className="text-sm text-danger">{state.message}</p>}

          {state.status === 'success' && (
            <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-2xl">
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

              <div className="bg-white border border-border rounded-2xl p-5">
                <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Seuils d'alertes</h3>
                <p className="text-xs text-text-muted mb-4">
                  Ajuste à partir de combien de jours chaque alerte automatique se déclenche (onglet « Alertes »).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {SEUIL_FIELDS.map(({ key, label, hint }) => (
                    <label key={key} className="block">
                      <span className="block text-xs font-semibold text-text-muted mb-1">{label}</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          value={seuils[key] ?? ''}
                          onChange={(e) => setSeuils((s) => ({ ...s, [key]: e.target.value }))}
                          className="input max-w-24"
                        />
                        <span className="text-xs text-text-muted">jours</span>
                      </div>
                      <span className="block text-[11px] text-text-muted mt-0.5">{hint}</span>
                    </label>
                  ))}
                </div>
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
          )}
        </>
      )}
    </div>
  )
}

export default ParametresView
