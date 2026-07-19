import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import AlertRow from '../components/AlertRow'
import {
  computeAnniversaires,
  computeFacturesImpayeesEnRetard,
  computeClientesARecontacter,
  computeCuresBientotTerminees,
  computePromosBientotExpirees,
  isNewsletterStale,
  daysSince,
  daysUntil,
} from '../lib/alerts'
import { fetchLastNewsletterSentAt } from '../lib/newsletterStatus'
import { computeCureProgress } from '../lib/cureProgress'
import {
  type DismissedAlert,
  fetchDismissedAlerts,
  dismissAlertKey,
  reconcileDismissedAlerts,
} from '../lib/dismissedAlerts'

interface Client {
  id: string
  nomComplet: string
  statut: string
  dateNaissance: string | null
}

interface RdvItem {
  clienteId: string | null
  clienteNom: string
  date: string | null
  prestationId: string | null
  prestationNom: string
  statut: string
}

interface FactureItem {
  id: string
  date: string | null
  montant: number | null
  payee: boolean
  clienteId: string | null
  clienteNom: string
}

interface Prestation {
  id: string
  type: string
}

interface Promotion {
  id: string
  nom: string
  active: boolean
  dateExpiration: string | null
}

interface ManualAlerte {
  id: string
  titre: string
  description: string
  date: string | null
  active: boolean
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success'
      clients: Client[]
      rendezvous: RdvItem[]
      factures: FactureItem[]
      prestations: Prestation[]
      promotions: Promotion[]
    }

type ManualState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; alertes: ManualAlerte[] }

function formatDateLongue(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

interface AlertesViewProps {
  onSelectClient: (id: string) => void
  onNavigateFacturation: () => void
  onNavigateNewsletter: () => void
}

function AlertesView({ onSelectClient, onNavigateFacturation, onNavigateNewsletter }: AlertesViewProps) {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [manualState, setManualState] = useState<ManualState>({ status: 'loading' })
  const [dismissedRaw, setDismissedRaw] = useState<DismissedAlert[]>([])
  const [validDismissedKeys, setValidDismissedKeys] = useState<Set<string>>(new Set())
  const [showCreate, setShowCreate] = useState(false)
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [manualError, setManualError] = useState<string | null>(null)
  const [dismissError, setDismissError] = useState<string | null>(null)
  const [lastNewsletterSentAt, setLastNewsletterSentAt] = useState<string | null>(null)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    Promise.all([
      apiFetch<{ clients: Client[] }>(getToken, '/api/clients'),
      apiFetch<{ rendezvous: RdvItem[] }>(getToken, '/api/rendezvous'),
      apiFetch<{ factures: FactureItem[] }>(getToken, '/api/factures'),
      apiFetch<{ prestations: Prestation[] }>(getToken, '/api/prestations'),
      apiFetch<{ promotions: Promotion[] }>(getToken, '/api/prestations?resource=promotions'),
      fetchDismissedAlerts(getToken).catch(() => []),
      fetchLastNewsletterSentAt(getToken).catch(() => null),
    ])
      .then(([clientsData, rdvData, facturesData, prestationsData, promosData, dismissedData, lastSentAt]) => {
        setState({
          status: 'success',
          clients: clientsData.clients,
          rendezvous: rdvData.rendezvous,
          factures: facturesData.factures,
          prestations: prestationsData.prestations,
          promotions: promosData.promotions,
        })
        setDismissedRaw(dismissedData)
        setLastNewsletterSentAt(lastSentAt)
      })
      .catch((error: unknown) => {
        setState({ status: 'error', message: error instanceof ApiError ? error.message : 'Erreur inconnue.' })
      })
  }, [getToken])

  const loadManual = useCallback(() => {
    setManualState({ status: 'loading' })
    apiFetch<{ alertes: ManualAlerte[] }>(getToken, '/api/prestations?resource=alertes')
      .then((data) => setManualState({ status: 'success', alertes: data.alertes }))
      .catch((error: unknown) => {
        setManualState({ status: 'error', message: error instanceof ApiError ? error.message : 'Erreur inconnue.' })
      })
  }, [getToken])

  useEffect(() => {
    load()
    loadManual()
  }, [load, loadManual])

  async function handleDismiss(key: string) {
    setValidDismissedKeys((prev) => new Set(prev).add(key))
    setDismissError(null)
    try {
      await dismissAlertKey(getToken, key)
      setDismissedRaw(await fetchDismissedAlerts(getToken))
    } catch (err) {
      setDismissError(
        err instanceof ApiError
          ? err.message
          : "Impossible d'enregistrer sur tous tes appareils, mais l'alerte reste masquée ici.",
      )
    }
  }

  const now = useMemo(() => new Date(), [])

  const rawComputed = useMemo(() => {
    if (state.status !== 'success') return null
    const cureProgress = computeCureProgress(state.rendezvous, state.prestations)

    return {
      newsletterStale: isNewsletterStale(lastNewsletterSentAt, now),
      promosBientotExpirees: computePromosBientotExpirees(state.promotions, now),
      anniversaires: computeAnniversaires(state.clients, now),
      facturesImpayeesEnRetard: computeFacturesImpayeesEnRetard(state.factures, now),
      clientesARecontacter: computeClientesARecontacter(state.clients, state.rendezvous, now),
      curesBientotTerminees: computeCuresBientotTerminees(cureProgress),
    }
  }, [state, now, lastNewsletterSentAt])

  useEffect(() => {
    if (!rawComputed) return
    const keys = new Set<string>()
    if (rawComputed.newsletterStale) keys.add('newsletter')
    for (const p of rawComputed.promosBientotExpirees) keys.add(`promo-${p.id}`)
    for (const { client } of rawComputed.anniversaires) keys.add(`anniv-${client.id}-${now.getFullYear()}`)
    for (const f of rawComputed.facturesImpayeesEnRetard) keys.add(`facture-${f.id}`)
    for (const { client } of rawComputed.clientesARecontacter) keys.add(`recontact-${client.id}`)
    for (const c of rawComputed.curesBientotTerminees) keys.add(`cure-${c.id}`)
    reconcileDismissedAlerts(getToken, dismissedRaw, keys).then(setValidDismissedKeys)
  }, [rawComputed, dismissedRaw, getToken, now])

  const computed = useMemo(() => {
    if (!rawComputed) return null
    return {
      newsletterStale: rawComputed.newsletterStale && !validDismissedKeys.has('newsletter'),
      promosBientotExpirees: rawComputed.promosBientotExpirees.filter((p) => !validDismissedKeys.has(`promo-${p.id}`)),
      anniversaires: rawComputed.anniversaires.filter(
        ({ client }) => !validDismissedKeys.has(`anniv-${client.id}-${now.getFullYear()}`),
      ),
      facturesImpayeesEnRetard: rawComputed.facturesImpayeesEnRetard.filter(
        (f) => !validDismissedKeys.has(`facture-${f.id}`),
      ),
      clientesARecontacter: rawComputed.clientesARecontacter.filter(
        ({ client }) => !validDismissedKeys.has(`recontact-${client.id}`),
      ),
      curesBientotTerminees: rawComputed.curesBientotTerminees.filter((c) => !validDismissedKeys.has(`cure-${c.id}`)),
    }
  }, [rawComputed, validDismissedKeys, now])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!titre.trim()) {
      setFormError('Le titre est obligatoire.')
      return
    }
    setSaving(true)
    try {
      await apiFetch(getToken, '/api/prestations?resource=alertes', {
        method: 'POST',
        body: { titre: titre.trim(), description: description.trim(), date: date || null, active: true },
      })
      setTitre('')
      setDescription('')
      setDate('')
      setShowCreate(false)
      loadManual()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteManual(id: string) {
    setManualError(null)
    try {
      await apiFetch(getToken, `/api/prestations?resource=alertes&id=${id}`, { method: 'DELETE' })
      loadManual()
    } catch (err) {
      setManualError(err instanceof ApiError ? err.message : "Impossible de supprimer l'alerte.")
    }
  }

  async function toggleManualActive(a: ManualAlerte) {
    setManualError(null)
    try {
      await apiFetch(getToken, `/api/prestations?resource=alertes&id=${a.id}`, {
        method: 'PATCH',
        body: { active: !a.active },
      })
      loadManual()
    } catch (err) {
      setManualError(err instanceof ApiError ? err.message : "Impossible de mettre à jour l'alerte.")
    }
  }

  const totalComputed = computed
    ? computed.anniversaires.length +
      computed.facturesImpayeesEnRetard.length +
      computed.clientesARecontacter.length +
      computed.curesBientotTerminees.length +
      computed.promosBientotExpirees.length +
      (computed.newsletterStale ? 1 : 0)
    : 0

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-border rounded-2xl p-5">
        <h3 className="font-serif text-lg font-semibold text-sage-dark mb-4">
          Alertes automatiques {computed && `(${totalComputed})`}
        </h3>

        {dismissError && <p className="text-sm text-danger mb-3">{dismissError}</p>}

        {state.status === 'loading' && <p className="text-sm text-text-muted">Chargement…</p>}
        {state.status === 'error' && <p className="text-sm text-danger">{state.message}</p>}

        {computed && totalComputed === 0 && (
          <p className="text-sm text-text-muted">Aucune alerte automatique pour le moment.</p>
        )}

        {computed && totalComputed > 0 && (
          <div className="flex flex-col gap-1.5">
            {computed.newsletterStale && (
              <AlertRow
                colorClass="bg-gold-pale hover:bg-gold/20 transition-colors"
                subtitleClassName="text-gold-text"
                onClick={onNavigateNewsletter}
                onDismiss={() => handleDismiss('newsletter')}
                title="📧 Newsletter pas envoyée depuis longtemps"
                subtitle={lastNewsletterSentAt ? `Depuis ${daysSince(lastNewsletterSentAt, now)} jours` : 'Jamais envoyée'}
              />
            )}

            {computed.promosBientotExpirees.map((p) => (
              <AlertRow
                key={`promo-${p.id}`}
                colorClass="bg-gold-pale hover:bg-gold/20 transition-colors"
                subtitleClassName="text-gold-text"
                onClick={onNavigateFacturation}
                onDismiss={() => handleDismiss(`promo-${p.id}`)}
                title={`🏷️ Code promo bientôt expiré — ${p.nom}`}
                subtitle={
                  daysUntil(p.dateExpiration as string, now) === 0
                    ? "Expire aujourd'hui"
                    : `Expire dans ${daysUntil(p.dateExpiration as string, now)} jours`
                }
              />
            ))}

            {computed.anniversaires.map(({ client, jours }) => (
              <AlertRow
                key={`anniv-${client.id}`}
                colorClass="bg-gold-pale hover:bg-gold/20 transition-colors"
                subtitleClassName="text-gold-text"
                onClick={() => onSelectClient(client.id)}
                onDismiss={() => handleDismiss(`anniv-${client.id}-${now.getFullYear()}`)}
                title={
                  <>
                    🎂 {client.nomComplet}
                    <span className="text-text-muted font-normal"> — {formatDateLongue(client.dateNaissance)}</span>
                  </>
                }
                subtitle={jours === 0 ? "Aujourd'hui" : jours === 1 ? 'Demain' : `Dans ${jours} jours`}
              />
            ))}

            {computed.facturesImpayeesEnRetard.map((f) => (
              <AlertRow
                key={`facture-${f.id}`}
                colorClass="bg-danger-pale hover:bg-danger/10 transition-colors"
                subtitleClassName="text-danger"
                onClick={onNavigateFacturation}
                onDismiss={() => handleDismiss(`facture-${f.id}`)}
                title={`💶 Facture impayée — ${f.clienteNom || 'Cliente inconnue'}`}
                subtitle={`${f.montant !== null ? `${f.montant} € — ` : ''}en retard depuis ${daysSince(f.date as string, now)} jours`}
              />
            ))}

            {computed.clientesARecontacter.map(({ client, jours }) => (
              <AlertRow
                key={`recontact-${client.id}`}
                colorClass="bg-sage-pale hover:bg-sage-light transition-colors"
                subtitleClassName="text-sage-dark"
                onClick={() => onSelectClient(client.id)}
                onDismiss={() => handleDismiss(`recontact-${client.id}`)}
                title={`📞 À recontacter — ${client.nomComplet}`}
                subtitle={jours === null ? 'Aucun RDV enregistré' : `Vue il y a ${jours} jours`}
              />
            ))}

            {computed.curesBientotTerminees.map((c) => (
              <AlertRow
                key={`cure-${c.id}`}
                colorClass="bg-sage-pale hover:bg-sage-light transition-colors"
                subtitleClassName="text-sage-dark"
                onClick={() => onSelectClient(c.clienteId)}
                onDismiss={() => handleDismiss(`cure-${c.id}`)}
                title={`✨ Dernière séance de cure — ${c.clienteNom || 'Cliente inconnue'}`}
                subtitle={c.prestationNom}
              />
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="font-serif text-lg font-semibold text-sage-dark">Alertes personnalisées</h3>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="bg-sage-dark text-white px-4.5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-dark/90"
          >
            Ajouter une alerte
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="bg-sage-pale rounded-2xl p-4 mb-4 flex flex-col gap-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-text-muted mb-1">Titre *</span>
                <input type="text" value={titre} onChange={(e) => setTitre(e.target.value)} className="input" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-text-muted mb-1">Date</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
              </label>
            </div>
            <label className="block">
              <span className="block text-xs font-semibold text-text-muted mb-1">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="input resize-none"
              />
            </label>
            {formError && <p className="text-sm text-danger">{formError}</p>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2.5 rounded-[10px] text-sm font-semibold text-text-muted hover:bg-white"
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

        {manualError && <p className="text-sm text-danger mb-3">{manualError}</p>}

        {manualState.status === 'loading' && <p className="text-sm text-text-muted">Chargement…</p>}
        {manualState.status === 'error' && <p className="text-sm text-danger">{manualState.message}</p>}

        {manualState.status === 'success' && (
          <div className="flex flex-col gap-1.5">
            {manualState.alertes.length === 0 ? (
              <p className="text-sm text-text-muted">Aucune alerte personnalisée.</p>
            ) : (
              manualState.alertes.map((a) => (
                <div
                  key={a.id}
                  className={`rounded-lg p-3 flex items-start justify-between gap-3 ${
                    a.active ? 'bg-sage-pale' : 'bg-sage-pale/40 opacity-60'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{a.titre}</div>
                    {a.description && <div className="text-xs text-text-muted mt-0.5">{a.description}</div>}
                    {a.date && <div className="text-xs text-text-muted mt-0.5">{formatDateLongue(a.date)}</div>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => toggleManualActive(a)}
                      className="text-xs font-semibold text-sage-dark hover:underline"
                    >
                      {a.active ? 'Désactiver' : 'Activer'}
                    </button>
                    <button
                      onClick={() => handleDeleteManual(a.id)}
                      className="text-xs font-semibold text-danger hover:underline"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default AlertesView
