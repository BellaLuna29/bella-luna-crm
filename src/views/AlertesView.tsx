import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
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
import { LAST_NEWSLETTER_KEY } from '../lib/alertsConfig'

interface Client {
  id: string
  nomComplet: string
  statut: string
  dateNaissance: string | null
}

interface RdvItem {
  clienteId: string | null
  date: string | null
}

interface FactureItem {
  id: string
  date: string | null
  montant: number | null
  payee: boolean
  clienteId: string | null
  clienteNom: string
}

interface CureItem {
  id: string
  clienteId: string | null
  clienteNom: string
  prestationNom: string
  seancesRestantes: number
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
      cures: CureItem[]
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
  const [showCreate, setShowCreate] = useState(false)
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    Promise.all([
      apiFetch<{ clients: Client[] }>(getToken, '/api/clients'),
      apiFetch<{ rendezvous: RdvItem[] }>(getToken, '/api/rendezvous'),
      apiFetch<{ factures: FactureItem[] }>(getToken, '/api/factures'),
      apiFetch<{ cures: CureItem[] }>(getToken, '/api/cures'),
      apiFetch<{ promotions: Promotion[] }>(getToken, '/api/prestations?resource=promotions'),
    ])
      .then(([clientsData, rdvData, facturesData, curesData, promosData]) => {
        setState({
          status: 'success',
          clients: clientsData.clients,
          rendezvous: rdvData.rendezvous,
          factures: facturesData.factures,
          cures: curesData.cures,
          promotions: promosData.promotions,
        })
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

  const now = useMemo(() => new Date(), [])
  const lastNewsletterSentAt = useMemo(() => localStorage.getItem(LAST_NEWSLETTER_KEY), [])

  const computed = useMemo(() => {
    if (state.status !== 'success') return null
    return {
      anniversaires: computeAnniversaires(state.clients, now),
      facturesImpayeesEnRetard: computeFacturesImpayeesEnRetard(state.factures, now),
      clientesARecontacter: computeClientesARecontacter(state.clients, state.rendezvous, now),
      curesBientotTerminees: computeCuresBientotTerminees(state.cures),
      promosBientotExpirees: computePromosBientotExpirees(state.promotions, now),
      newsletterStale: isNewsletterStale(lastNewsletterSentAt, now),
    }
  }, [state, now, lastNewsletterSentAt])

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
    try {
      await apiFetch(getToken, `/api/prestations?resource=alertes&id=${id}`, { method: 'DELETE' })
      loadManual()
    } catch {
      // best effort
    }
  }

  async function toggleManualActive(a: ManualAlerte) {
    try {
      await apiFetch(getToken, `/api/prestations?resource=alertes&id=${a.id}`, {
        method: 'PATCH',
        body: { active: !a.active },
      })
      loadManual()
    } catch {
      // best effort
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

        {state.status === 'loading' && <p className="text-sm text-text-muted">Chargement…</p>}
        {state.status === 'error' && <p className="text-sm text-danger">{state.message}</p>}

        {computed && totalComputed === 0 && (
          <p className="text-sm text-text-muted">Aucune alerte automatique pour le moment.</p>
        )}

        {computed && totalComputed > 0 && (
          <div className="flex flex-col gap-1.5">
            {computed.newsletterStale && (
              <button
                onClick={onNavigateNewsletter}
                className="w-full text-left bg-gold-pale hover:bg-gold/20 transition-colors rounded-lg p-3 flex items-center justify-between gap-3"
              >
                <span className="text-sm font-semibold truncate">📧 Newsletter pas envoyée depuis longtemps</span>
                <span className="text-xs font-semibold text-gold-text shrink-0">
                  {lastNewsletterSentAt ? `Depuis ${daysSince(lastNewsletterSentAt, now)} jours` : 'Jamais envoyée'}
                </span>
              </button>
            )}

            {computed.promosBientotExpirees.map((p) => (
              <button
                key={`promo-${p.id}`}
                onClick={onNavigateFacturation}
                className="w-full text-left bg-gold-pale hover:bg-gold/20 transition-colors rounded-lg p-3 flex items-center justify-between gap-3"
              >
                <span className="text-sm font-semibold truncate">🏷️ Code promo bientôt expiré — {p.nom}</span>
                <span className="text-xs font-semibold text-gold-text shrink-0">
                  {daysUntil(p.dateExpiration as string, now) === 0
                    ? "Expire aujourd'hui"
                    : `Expire dans ${daysUntil(p.dateExpiration as string, now)} jours`}
                </span>
              </button>
            ))}

            {computed.anniversaires.map(({ client, jours }) => (
              <button
                key={`anniv-${client.id}`}
                onClick={() => onSelectClient(client.id)}
                className="w-full text-left bg-gold-pale hover:bg-gold/20 transition-colors rounded-lg p-3 flex items-center justify-between gap-3"
              >
                <span className="text-sm font-semibold truncate">
                  🎂 {client.nomComplet}
                  <span className="text-text-muted font-normal"> — {formatDateLongue(client.dateNaissance)}</span>
                </span>
                <span className="text-xs font-semibold text-gold-text shrink-0">
                  {jours === 0 ? "Aujourd'hui" : jours === 1 ? 'Demain' : `Dans ${jours} jours`}
                </span>
              </button>
            ))}

            {computed.facturesImpayeesEnRetard.map((f) => (
              <button
                key={`facture-${f.id}`}
                onClick={onNavigateFacturation}
                className="w-full text-left bg-danger-pale hover:bg-danger/10 transition-colors rounded-lg p-3 flex items-center justify-between gap-3"
              >
                <span className="text-sm font-semibold truncate">
                  💶 Facture impayée — {f.clienteNom || 'Cliente inconnue'}
                </span>
                <span className="text-xs font-semibold text-danger shrink-0">
                  {f.montant !== null ? `${f.montant} € — ` : ''}
                  en retard depuis {daysSince(f.date as string, now)} jours
                </span>
              </button>
            ))}

            {computed.clientesARecontacter.map(({ client, jours }) => (
              <button
                key={`recontact-${client.id}`}
                onClick={() => onSelectClient(client.id)}
                className="w-full text-left bg-sage-pale hover:bg-sage-light transition-colors rounded-lg p-3 flex items-center justify-between gap-3"
              >
                <span className="text-sm font-semibold truncate">📞 À recontacter — {client.nomComplet}</span>
                <span className="text-xs font-semibold text-sage-dark shrink-0">
                  {jours === null ? 'Aucun RDV enregistré' : `Vue il y a ${jours} jours`}
                </span>
              </button>
            ))}

            {computed.curesBientotTerminees.map((c) => (
              <button
                key={`cure-${c.id}`}
                onClick={() => c.clienteId && onSelectClient(c.clienteId)}
                className="w-full text-left bg-sage-pale hover:bg-sage-light transition-colors rounded-lg p-3 flex items-center justify-between gap-3"
              >
                <span className="text-sm font-semibold truncate">
                  ✨ Dernière séance de cure — {c.clienteNom || 'Cliente inconnue'}
                </span>
                <span className="text-xs font-semibold text-sage-dark shrink-0">{c.prestationNom}</span>
              </button>
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
