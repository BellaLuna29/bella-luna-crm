import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import { fetchParametres, saveParametres, type Parametres } from '../lib/parametres'
import { useToast } from '../components/ToastProvider'
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
  const { showToast } = useToast()
  const [subTab, setSubTab] = useState<SubTab>('general')
  const [state, setState] = useState<State>({ status: 'loading' })
  const [objectifCa, setObjectifCa] = useState('')
  const [seuils, setSeuils] = useState<Record<string, string>>({})
  const [rappelsAutoActifs, setRappelsAutoActifs] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [urssafDebut, setUrssafDebut] = useState('')
  const [urssafFin, setUrssafFin] = useState('')
  const [urssafExporting, setUrssafExporting] = useState(false)
  const [urssafError, setUrssafError] = useState<string | null>(null)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    fetchParametres(getToken)
      .then((data) => {
        setObjectifCa(data.objectifCaMensuel !== null ? String(data.objectifCaMensuel) : '')
        setSeuils(Object.fromEntries(SEUIL_FIELDS.map(({ key }) => [key, String(data[key])])))
        setRappelsAutoActifs(data.rappelsAutoActifs)
        setState({ status: 'success' })
      })
      .catch((error: unknown) => {
        setState({ status: 'error', message: error instanceof ApiError ? error.message : 'Erreur inconnue.' })
      })
  }, [getToken])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const now = new Date()
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
    const debut = new Date(now.getFullYear(), quarterStartMonth, 1)
    setUrssafDebut(debut.toISOString().slice(0, 10))
    setUrssafFin(now.toISOString().slice(0, 10))
  }, [])

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
      await saveParametres(getToken, { objectifCaMensuel: objectifNum, rappelsAutoActifs, ...seuilUpdates })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const data = await apiFetch<unknown>(getToken, '/api/prestations?resource=backup-export')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bella-luna-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      showToast('Export téléchargé.')
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Impossible de générer l'export.", 'error')
    } finally {
      setExporting(false)
    }
  }

  async function handleExportUrssaf() {
    setUrssafError(null)
    if (!urssafDebut || !urssafFin) {
      setUrssafError('Choisis une date de début et une date de fin.')
      return
    }
    setUrssafExporting(true)
    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL
      const token = await getToken()
      const response = await fetch(
        `${baseUrl}/api/prestations?resource=urssaf-export&debut=${urssafDebut}&fin=${urssafFin}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      )
      if (!response.ok) {
        throw new ApiError("Impossible de générer l'export.")
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bella-luna-urssaf-${urssafDebut}-au-${urssafFin}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      showToast('Export URSSAF téléchargé.')
    } catch (err) {
      setUrssafError(err instanceof ApiError ? err.message : "Impossible de générer l'export.")
    } finally {
      setUrssafExporting(false)
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

              <div className="bg-white border border-border rounded-2xl p-5">
                <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Rappels automatiques</h3>
                <p className="text-xs text-text-muted mb-4">
                  Quand c'est activé, les rappels « nouveau client » (72h avant) et « client » (48h avant) sont
                  envoyés automatiquement par e-mail chaque jour, sans que tu aies à cliquer sur Contacter.
                  Désactivé par défaut — tu gardes la main via l'onglet Communications tant que ce n'est pas activé.
                </p>
                <label className="flex items-center gap-2 text-sm font-semibold text-sage-dark">
                  <input
                    type="checkbox"
                    checked={rappelsAutoActifs}
                    onChange={(e) => setRappelsAutoActifs(e.target.checked)}
                    className="w-4 h-4"
                  />
                  Activer l'envoi automatique des rappels par e-mail
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
          )}

          {state.status === 'success' && (
            <div className="bg-white border border-border rounded-2xl p-5 max-w-2xl mt-6">
              <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Sauvegarde de tes données</h3>
              <p className="text-xs text-text-muted mb-4">
                Télécharge une copie complète de tes données (clientes, rendez-vous, factures, prestations...) au
                format JSON, à garder de ton côté par sécurité.
              </p>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="bg-white border border-border text-sage-dark px-5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-pale disabled:opacity-50"
              >
                {exporting ? 'Export en cours…' : 'Exporter mes données'}
              </button>
            </div>
          )}

          {state.status === 'success' && (
            <div className="bg-white border border-border rounded-2xl p-5 max-w-2xl mt-6">
              <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Export comptable (URSSAF)</h3>
              <p className="text-xs text-text-muted mb-4">
                Liste des factures encaissées sur une période, avec le total par catégorie — pour préparer ta
                déclaration de chiffre d'affaires micro-entreprise.
              </p>
              <div className="flex items-end gap-3 flex-wrap mb-3">
                <label className="block">
                  <span className="block text-xs font-semibold text-text-muted mb-1">Du</span>
                  <input
                    type="date"
                    value={urssafDebut}
                    onChange={(e) => setUrssafDebut(e.target.value)}
                    className="input"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-text-muted mb-1">Au</span>
                  <input type="date" value={urssafFin} onChange={(e) => setUrssafFin(e.target.value)} className="input" />
                </label>
                <button
                  type="button"
                  onClick={handleExportUrssaf}
                  disabled={urssafExporting}
                  className="bg-white border border-border text-sage-dark px-5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-pale disabled:opacity-50"
                >
                  {urssafExporting ? 'Export en cours…' : 'Exporter (CSV)'}
                </button>
              </div>
              {urssafError && <p className="text-sm text-danger">{urssafError}</p>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default ParametresView
