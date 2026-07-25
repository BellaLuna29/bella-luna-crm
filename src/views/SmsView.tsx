import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import MessageComposerModal from '../components/MessageComposerModal'
import SearchableSelect from '../components/SearchableSelect'
import Icon, { type IconName } from '../components/Icon'
import type { TemplateContext } from '../lib/templateEngine'
import { formatDateHeureNaturel } from '../lib/formatDate'
import { computeAnniversaires, computeFacturesImpayeesEnRetard, computeClientesARecontacter, daysSince } from '../lib/alerts'
import {
  type DismissedAlert,
  fetchDismissedAlerts,
  dismissAlertKey,
  reconcileDismissedAlerts,
} from '../lib/dismissedAlerts'

interface Client {
  id: string
  nomComplet: string
  telephone: string
  email: string
  statut: string
  dateNaissance: string | null
}

interface RdvItem {
  id: string
  date: string | null
  clienteId: string | null
  clienteNom: string
  prestationNom: string
  prix: number | null
}

interface FactureItem {
  id: string
  date: string | null
  montant: number | null
  payee: boolean
  clienteId: string | null
  clienteNom: string
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; clients: Client[]; rendezvous: RdvItem[]; factures: FactureItem[] }

const HOUR_MS = 60 * 60 * 1000

function formatDateCourte(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

interface ContactRowProps {
  title: string
  subtitle: string
  colorClass: string
  icon?: IconName
  iconClass?: string
  onContact: () => void
  onDismiss?: () => void
}

function ContactRow({ title, subtitle, colorClass, icon, iconClass, onContact, onDismiss }: ContactRowProps) {
  return (
    <div className={`flex items-center gap-3 rounded-lg p-3 ${colorClass}`}>
      {icon && (
        <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconClass ?? 'bg-white text-sage-dark'}`}>
          <Icon name={icon} size={15} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold truncate">{title}</div>
        <div className="text-xs text-text-muted truncate">{subtitle}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onContact}
          className="bg-white border border-border text-sage-dark px-3.5 py-1.5 rounded-[10px] text-xs font-semibold hover:bg-sage-pale"
        >
          Contacter
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-white hover:bg-sage-light text-text-muted"
            aria-label="Ne plus me rappeler cette alerte"
            title="Ne plus me rappeler"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

function SmsView() {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [dismissedRaw, setDismissedRaw] = useState<DismissedAlert[]>([])
  const [validDismissedKeys, setValidDismissedKeys] = useState<Set<string>>(new Set())
  const [composer, setComposer] = useState<{
    context: TemplateContext
    telephone: string
    email: string
    templateKey: string
  } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickedClientId, setPickedClientId] = useState('')

  const load = useCallback(() => {
    setState({ status: 'loading' })
    Promise.all([
      apiFetch<{ clients: Client[] }>(getToken, '/api/clients'),
      apiFetch<{ rendezvous: RdvItem[] }>(getToken, '/api/rendezvous'),
      apiFetch<{ factures: FactureItem[] }>(getToken, '/api/factures'),
      fetchDismissedAlerts(getToken).catch(() => []),
    ])
      .then(([clientsData, rdvData, facturesData, dismissedData]) => {
        setState({
          status: 'success',
          clients: clientsData.clients,
          rendezvous: rdvData.rendezvous,
          factures: facturesData.factures,
        })
        setDismissedRaw(dismissedData)
      })
      .catch((error: unknown) => {
        setState({
          status: 'error',
          message: error instanceof ApiError ? error.message : 'Erreur inconnue.',
        })
      })
  }, [getToken])

  useEffect(() => {
    load()
  }, [load])

  async function handleDismissRecontact(clientId: string) {
    await handleDismissKey(`recontact-${clientId}`)
  }

  async function handleDismissKey(key: string) {
    setValidDismissedKeys((prev) => new Set(prev).add(key))
    try {
      await dismissAlertKey(getToken, key)
      setDismissedRaw(await fetchDismissedAlerts(getToken))
    } catch {
      // best effort — stays hidden locally for this session even if the sync failed
    }
  }

  const now = useMemo(() => new Date(), [])

  const rawSections = useMemo(() => {
    if (state.status !== 'success') return null
    const { clients, rendezvous, factures } = state
    const clientById = new Map(clients.map((c) => [c.id, c]))

    const rdvCountByClient = new Map<string, number>()
    for (const r of rendezvous) {
      if (!r.clienteId) continue
      rdvCountByClient.set(r.clienteId, (rdvCountByClient.get(r.clienteId) ?? 0) + 1)
    }
    const hasHistory = (clienteId: string | null) => (clienteId ? (rdvCountByClient.get(clienteId) ?? 0) > 1 : false)

    function upcomingWithin(window: number, wantHistory: boolean) {
      return rendezvous
        .filter((r) => {
          if (!r.date) return false
          const t = new Date(r.date).getTime()
          if (Number.isNaN(t)) return false
          const diff = t - now.getTime()
          if (diff <= 0 || diff > window) return false
          return hasHistory(r.clienteId) === wantHistory
        })
        .sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime())
    }

    const rappelsNouveauClient = upcomingWithin(72 * HOUR_MS, false)
    const rappelsClientExistant = upcomingWithin(48 * HOUR_MS, true)

    const aRecontacter = computeClientesARecontacter(clients, rendezvous, now)
    const anniversaires = computeAnniversaires(clients, now)
    const facturesImpayees = computeFacturesImpayeesEnRetard(factures, now)

    return { rappelsNouveauClient, rappelsClientExistant, aRecontacter, anniversaires, facturesImpayees, clientById }
  }, [state, now])

  useEffect(() => {
    if (!rawSections) return
    const keys = new Set<string>()
    for (const { client } of rawSections.aRecontacter) keys.add(`recontact-${client.id}`)
    for (const r of rawSections.rappelsNouveauClient) keys.add(`rappel-nouveau-${r.id}`)
    for (const r of rawSections.rappelsClientExistant) keys.add(`rappel-existant-${r.id}`)
    reconcileDismissedAlerts(getToken, dismissedRaw, keys).then(setValidDismissedKeys)
  }, [rawSections, dismissedRaw, getToken])

  const sections = useMemo(() => {
    if (!rawSections) return null
    return {
      ...rawSections,
      aRecontacter: rawSections.aRecontacter.filter(({ client }) => !validDismissedKeys.has(`recontact-${client.id}`)),
      rappelsNouveauClient: rawSections.rappelsNouveauClient.filter(
        (r) => !validDismissedKeys.has(`rappel-nouveau-${r.id}`),
      ),
      rappelsClientExistant: rawSections.rappelsClientExistant.filter(
        (r) => !validDismissedKeys.has(`rappel-existant-${r.id}`),
      ),
    }
  }, [rawSections, validDismissedKeys])

  function contactFromRdv(r: RdvItem, templateKey: 'rappel' | 'nouveauClient' = 'rappel') {
    const client = sections?.clientById.get(r.clienteId ?? '')
    setComposer({
      context: {
        nomComplet: r.clienteNom || client?.nomComplet || 'cliente',
        date: formatDateHeureNaturel(r.date),
        prestation: r.prestationNom,
        montant: r.prix ?? undefined,
      },
      telephone: client?.telephone ?? '',
      email: client?.email ?? '',
      templateKey,
    })
  }

  function contactRecontact(client: Client) {
    setComposer({
      context: { nomComplet: client.nomComplet },
      telephone: client.telephone,
      email: client.email,
      templateKey: 'recontact',
    })
  }

  function contactAnniversaire(client: Client) {
    setComposer({
      context: { nomComplet: client.nomComplet },
      telephone: client.telephone,
      email: client.email,
      templateKey: 'anniversaire',
    })
  }

  function contactFacture(f: FactureItem) {
    const client = sections?.clientById.get(f.clienteId ?? '')
    setComposer({
      context: {
        nomComplet: f.clienteNom || client?.nomComplet || 'cliente',
        montant: f.montant ?? undefined,
      },
      telephone: client?.telephone ?? '',
      email: client?.email ?? '',
      templateKey: 'facture',
    })
  }

  function contactLibre() {
    setPickedClientId('')
    setPickerOpen(true)
  }

  function confirmPickedClient() {
    const client = sections?.clientById.get(pickedClientId)
    if (!client) return
    setPickerOpen(false)
    setComposer({
      context: { nomComplet: client.nomComplet },
      telephone: client.telephone,
      email: client.email,
      templateKey: 'libre',
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <p className="text-sm text-text-muted">
          Prépare des SMS ou e-mails pré-remplis à partir de suggestions, puis envoie-les depuis l'app native de ta tablette.
        </p>
        <button
          onClick={contactLibre}
          className="bg-sage-dark text-white px-4.5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-dark/90 shrink-0"
        >
          Nouveau message
        </button>
      </div>

      {state.status === 'loading' && <p className="text-sm text-text-muted">Chargement…</p>}
      {state.status === 'error' && <p className="text-sm text-danger">{state.message}</p>}

      {state.status === 'success' && sections && (
        <div className="flex flex-col gap-6">
          <div className="bg-white border border-border rounded-2xl p-5">
            <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Rappel nouveau client</h3>
            <p className="text-xs text-text-muted mb-4">
              72 h avant, pour les clientes qui n'ont encore aucun autre rendez-vous enregistré.
            </p>
            {sections.rappelsNouveauClient.length === 0 ? (
              <p className="text-sm text-text-muted">Aucun premier rendez-vous à rappeler pour le moment.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sections.rappelsNouveauClient.map((r) => (
                  <ContactRow
                    key={r.id}
                    title={r.clienteNom || 'Cliente inconnue'}
                    subtitle={`${r.prestationNom || 'Prestation'} — ${formatDateCourte(r.date)}`}
                    colorClass="bg-gold-pale"
                    icon="calendar"
                    iconClass="bg-gold/25 text-gold-text"
                    onContact={() => contactFromRdv(r, 'nouveauClient')}
                    onDismiss={() => handleDismissKey(`rappel-nouveau-${r.id}`)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-border rounded-2xl p-5">
            <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Rappel client</h3>
            <p className="text-xs text-text-muted mb-4">48 h avant, pour les clientes déjà venues.</p>
            {sections.rappelsClientExistant.length === 0 ? (
              <p className="text-sm text-text-muted">Aucun rendez-vous à rappeler pour le moment.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sections.rappelsClientExistant.map((r) => (
                  <ContactRow
                    key={r.id}
                    title={r.clienteNom || 'Cliente inconnue'}
                    subtitle={`${r.prestationNom || 'Prestation'} — ${formatDateCourte(r.date)}`}
                    colorClass="bg-sage-pale"
                    icon="calendar"
                    iconClass="bg-sage/20 text-sage-dark"
                    onContact={() => contactFromRdv(r)}
                    onDismiss={() => handleDismissKey(`rappel-existant-${r.id}`)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-border rounded-2xl p-5">
            <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Clientes à recontacter</h3>
            <p className="text-xs text-text-muted mb-4">Clientes régulières sans rendez-vous depuis plus d'un mois.</p>
            {sections.aRecontacter.length === 0 ? (
              <p className="text-sm text-text-muted">Aucune cliente régulière à recontacter pour le moment.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sections.aRecontacter.map(({ client, jours }) => (
                  <ContactRow
                    key={client.id}
                    title={client.nomComplet}
                    subtitle={jours === null ? 'Aucun rendez-vous enregistré' : `Vue il y a ${jours} jours`}
                    colorClass="bg-sage-pale"
                    icon="phone"
                    iconClass="bg-sage/20 text-sage-dark"
                    onContact={() => contactRecontact(client)}
                    onDismiss={() => handleDismissRecontact(client.id)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-border rounded-2xl p-5">
            <h3 className="font-serif text-lg font-semibold text-sage-dark mb-4">Anniversaires (7 jours)</h3>
            {sections.anniversaires.length === 0 ? (
              <p className="text-sm text-text-muted">Aucun anniversaire dans les 7 prochains jours.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sections.anniversaires.map(({ client, jours }) => (
                  <ContactRow
                    key={client.id}
                    title={client.nomComplet}
                    subtitle={jours === 0 ? "Aujourd'hui" : jours === 1 ? 'Demain' : `Dans ${jours} jours`}
                    colorClass="bg-gold-pale"
                    icon="cake"
                    iconClass="bg-gold/25 text-gold-text"
                    onContact={() => contactAnniversaire(client)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-border rounded-2xl p-5">
            <h3 className="font-serif text-lg font-semibold text-sage-dark mb-4">Factures impayées (+14 jours)</h3>
            {sections.facturesImpayees.length === 0 ? (
              <p className="text-sm text-text-muted">Aucune facture en retard.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sections.facturesImpayees.map((f) => (
                  <ContactRow
                    key={f.id}
                    title={f.clienteNom || 'Cliente inconnue'}
                    subtitle={`${f.montant !== null ? `${f.montant} € — ` : ''}en retard depuis ${daysSince(f.date as string, now)} jours`}
                    colorClass="bg-danger-pale"
                    icon="receipt"
                    iconClass="bg-danger/20 text-danger"
                    onContact={() => contactFacture(f)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {pickerOpen && state.status === 'success' && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <h3 className="font-serif text-xl font-semibold text-sage-dark mb-4">Choisir une cliente</h3>
            <SearchableSelect
              options={state.clients.map((c) => ({ id: c.id, label: c.nomComplet }))}
              value={pickedClientId}
              onChange={setPickedClientId}
              placeholder="Rechercher une cliente..."
              emptyLabel="Aucune cliente trouvée."
            />
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => setPickerOpen(false)}
                className="px-4 py-2.5 rounded-[10px] text-sm font-semibold text-text-muted hover:bg-sage-pale"
              >
                Annuler
              </button>
              <button
                onClick={confirmPickedClient}
                disabled={!pickedClientId}
                className="bg-sage-dark text-white px-5 py-2.5 rounded-[10px] text-sm font-semibold disabled:opacity-50"
              >
                Continuer
              </button>
            </div>
          </div>
        </div>
      )}

      {composer && (
        <MessageComposerModal
          context={composer.context}
          telephone={composer.telephone}
          email={composer.email}
          initialTemplateKey={composer.templateKey}
          onClose={() => setComposer(null)}
        />
      )}
    </div>
  )
}

export default SmsView
