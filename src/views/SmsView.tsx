import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import MessageComposerModal from '../components/MessageComposerModal'
import SearchableSelect from '../components/SearchableSelect'
import Modal from '../components/Modal'
import Icon, { type IconName } from '../components/Icon'
import type { TemplateContext } from '../lib/templateEngine'
import { formatDateHeureNaturel } from '../lib/formatDate'
import {
  computeAnniversaires,
  computeFacturesImpayeesEnRetard,
  computeClientesARecontacter,
  computeClientesInactivesLongues,
  daysSince,
} from '../lib/alerts'
import { computeCureProgress, computeCuresMiParcours } from '../lib/cureProgress'
import { computeFideliteMassage, computeFideliteCils, isDrainageOuMadero } from '../lib/loyalty'
import {
  type DismissedAlert,
  fetchDismissedAlerts,
  dismissAlertKey,
  reconcileDismissedAlerts,
} from '../lib/dismissedAlerts'
import { fetchParametres } from '../lib/parametres'

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
  statut: string
  clienteId: string | null
  clienteNom: string
  prestationId: string | null
  prestationNom: string
  prestationCategorie: string
  notes: string
  prix: number | null
}

interface Prestation {
  id: string
  type: string
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
  | {
      status: 'success'
      clients: Client[]
      rendezvous: RdvItem[]
      factures: FactureItem[]
      prestations: Prestation[]
      seuilInactiviteLongueJours: number
    }

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
  const [pickerMode, setPickerMode] = useState<'client' | 'libre'>('client')
  const [pickedClientId, setPickedClientId] = useState('')
  const [libreNom, setLibreNom] = useState('')
  const [libreTelephone, setLibreTelephone] = useState('')
  const [libreEmail, setLibreEmail] = useState('')

  const load = useCallback(() => {
    setState({ status: 'loading' })
    Promise.all([
      apiFetch<{ clients: Client[] }>(getToken, '/api/clients'),
      apiFetch<{ rendezvous: RdvItem[] }>(getToken, '/api/rendezvous'),
      apiFetch<{ factures: FactureItem[] }>(getToken, '/api/factures'),
      apiFetch<{ prestations: Prestation[] }>(getToken, '/api/prestations'),
      fetchParametres(getToken).catch(() => ({ seuilInactiviteLongueJours: 180 })),
      fetchDismissedAlerts(getToken).catch(() => []),
    ])
      .then(([clientsData, rdvData, facturesData, prestationsData, parametresData, dismissedData]) => {
        setState({
          status: 'success',
          clients: clientsData.clients,
          rendezvous: rdvData.rendezvous,
          factures: facturesData.factures,
          prestations: prestationsData.prestations,
          seuilInactiviteLongueJours: parametresData.seuilInactiviteLongueJours,
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
    const { clients, rendezvous, factures, prestations, seuilInactiviteLongueJours } = state
    const clientById = new Map(clients.map((c) => [c.id, c]))

    const rdvCountByClient = new Map<string, number>()
    const firstHonoreByClient = new Map<string, number>()
    for (const r of rendezvous) {
      if (!r.clienteId) continue
      rdvCountByClient.set(r.clienteId, (rdvCountByClient.get(r.clienteId) ?? 0) + 1)
      if (r.statut === 'Honoré' && r.date) {
        const t = new Date(r.date).getTime()
        if (!Number.isNaN(t)) {
          const prev = firstHonoreByClient.get(r.clienteId)
          if (prev === undefined || t < prev) firstHonoreByClient.set(r.clienteId, t)
        }
      }
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

    // Demande d'avis : quelques jours après la toute première visite honorée.
    const rappelsAvis = rendezvous
      .filter((r) => {
        if (r.statut !== 'Honoré' || !r.clienteId || !r.date) return false
        const t = new Date(r.date).getTime()
        if (Number.isNaN(t) || firstHonoreByClient.get(r.clienteId) !== t) return false
        const diff = now.getTime() - t
        return diff >= 2 * 24 * HOUR_MS && diff <= 5 * 24 * HOUR_MS
      })
      .sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime())

    // Suivi 24-48h après un soin Drainage / Madérothérapie.
    const rappelsSuivi = rendezvous
      .filter((r) => {
        if (r.statut !== 'Honoré' || !r.clienteId || !r.date) return false
        if (!isDrainageOuMadero(r)) return false
        const t = new Date(r.date).getTime()
        if (Number.isNaN(t)) return false
        const diff = now.getTime() - t
        return diff >= 24 * HOUR_MS && diff <= 48 * HOUR_MS
      })
      .sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime())

    const cureProgress = computeCureProgress(rendezvous, prestations)
    const milieuCure = computeCuresMiParcours(cureProgress)

    const fideliteMassage = computeFideliteMassage(rendezvous)
    const fideliteCils = computeFideliteCils(rendezvous)

    const inactivesLongues = computeClientesInactivesLongues(clients, rendezvous, now, seuilInactiviteLongueJours)
    const inactivesLonguesIds = new Set(inactivesLongues.map(({ client }) => client.id))
    const aRecontacter = computeClientesARecontacter(clients, rendezvous, now).filter(
      ({ client }) => !inactivesLonguesIds.has(client.id),
    )
    const anniversaires = computeAnniversaires(clients, now)
    const facturesImpayees = computeFacturesImpayeesEnRetard(factures, now)

    return {
      rappelsNouveauClient,
      rappelsClientExistant,
      rappelsAvis,
      rappelsSuivi,
      milieuCure,
      fideliteMassage,
      fideliteCils,
      inactivesLongues,
      aRecontacter,
      anniversaires,
      facturesImpayees,
      clientById,
    }
  }, [state, now])

  useEffect(() => {
    if (!rawSections) return
    const keys = new Set<string>()
    for (const { client } of rawSections.aRecontacter) keys.add(`recontact-${client.id}`)
    for (const r of rawSections.rappelsNouveauClient) keys.add(`rappel-nouveau-${r.id}`)
    for (const r of rawSections.rappelsClientExistant) keys.add(`rappel-existant-${r.id}`)
    for (const r of rawSections.rappelsAvis) keys.add(`rappel-avis-${r.id}`)
    for (const r of rawSections.rappelsSuivi) keys.add(`rappel-suivi-${r.id}`)
    for (const c of rawSections.milieuCure) keys.add(`cure-mi-${c.id}`)
    for (const m of rawSections.fideliteMassage) keys.add(`fidelite-massage-${m.id}`)
    for (const m of rawSections.fideliteCils) keys.add(`fidelite-cils-${m.id}`)
    for (const { client } of rawSections.inactivesLongues) keys.add(`inactive-${client.id}`)
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
      rappelsAvis: rawSections.rappelsAvis.filter((r) => !validDismissedKeys.has(`rappel-avis-${r.id}`)),
      rappelsSuivi: rawSections.rappelsSuivi.filter((r) => !validDismissedKeys.has(`rappel-suivi-${r.id}`)),
      milieuCure: rawSections.milieuCure.filter((c) => !validDismissedKeys.has(`cure-mi-${c.id}`)),
      fideliteMassage: rawSections.fideliteMassage.filter((m) => !validDismissedKeys.has(`fidelite-massage-${m.id}`)),
      fideliteCils: rawSections.fideliteCils.filter((m) => !validDismissedKeys.has(`fidelite-cils-${m.id}`)),
      inactivesLongues: rawSections.inactivesLongues.filter(({ client }) => !validDismissedKeys.has(`inactive-${client.id}`)),
    }
  }, [rawSections, validDismissedKeys])

  function contactFromRdv(r: RdvItem, templateKey: 'rappel' | 'nouveauClient' | 'avis' | 'suivi' = 'rappel') {
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

  function contactInactiveLongue(client: Client) {
    setComposer({
      context: { nomComplet: client.nomComplet },
      telephone: client.telephone,
      email: client.email,
      templateKey: 'offreRetour',
    })
  }

  function contactMilieuCure(c: { clienteId: string; clienteNom: string; prestationNom: string }) {
    const client = sections?.clientById.get(c.clienteId)
    setComposer({
      context: { nomComplet: c.clienteNom || client?.nomComplet || 'cliente', prestation: c.prestationNom },
      telephone: client?.telephone ?? '',
      email: client?.email ?? '',
      templateKey: 'milieuCure',
    })
  }

  function contactFidelite(m: { clienteId: string; clienteNom: string; recompense: string }) {
    const client = sections?.clientById.get(m.clienteId)
    setComposer({
      context: { nomComplet: m.clienteNom || client?.nomComplet || 'cliente', recompense: m.recompense },
      telephone: client?.telephone ?? '',
      email: client?.email ?? '',
      templateKey: 'fidelite',
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
    setPickerMode('client')
    setLibreNom('')
    setLibreTelephone('')
    setLibreEmail('')
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

  function confirmContactSansFiche() {
    if (!libreTelephone.trim() && !libreEmail.trim()) return
    setPickerOpen(false)
    setComposer({
      context: { nomComplet: libreNom.trim() || 'là' },
      telephone: libreTelephone.trim(),
      email: libreEmail.trim(),
      templateKey: 'lienReservation',
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
            <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Demande d'avis</h3>
            <p className="text-xs text-text-muted mb-4">Quelques jours après la toute première visite d'une cliente.</p>
            {sections.rappelsAvis.length === 0 ? (
              <p className="text-sm text-text-muted">Aucune demande d'avis à envoyer pour le moment.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sections.rappelsAvis.map((r) => (
                  <ContactRow
                    key={r.id}
                    title={r.clienteNom || 'Cliente inconnue'}
                    subtitle={`${r.prestationNom || 'Prestation'} — ${formatDateCourte(r.date)}`}
                    colorClass="bg-gold-pale"
                    icon="cake"
                    iconClass="bg-gold/25 text-gold-text"
                    onContact={() => contactFromRdv(r, 'avis')}
                    onDismiss={() => handleDismissKey(`rappel-avis-${r.id}`)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-border rounded-2xl p-5">
            <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Suivi après soin</h3>
            <p className="text-xs text-text-muted mb-4">24 à 48 h après un Drainage ou une Madérothérapie.</p>
            {sections.rappelsSuivi.length === 0 ? (
              <p className="text-sm text-text-muted">Aucun suivi à envoyer pour le moment.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sections.rappelsSuivi.map((r) => (
                  <ContactRow
                    key={r.id}
                    title={r.clienteNom || 'Cliente inconnue'}
                    subtitle={`${r.prestationNom || 'Prestation'} — ${formatDateCourte(r.date)}`}
                    colorClass="bg-sage-pale"
                    icon="calendar"
                    iconClass="bg-sage/20 text-sage-dark"
                    onContact={() => contactFromRdv(r, 'suivi')}
                    onDismiss={() => handleDismissKey(`rappel-suivi-${r.id}`)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-border rounded-2xl p-5">
            <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Milieu de cure</h3>
            <p className="text-xs text-text-muted mb-4">Pour proposer un petit bilan à mi-parcours d'une cure.</p>
            {sections.milieuCure.length === 0 ? (
              <p className="text-sm text-text-muted">Aucune cure à mi-parcours pour le moment.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sections.milieuCure.map((c) => (
                  <ContactRow
                    key={c.id}
                    title={c.clienteNom || 'Cliente inconnue'}
                    subtitle={`${c.prestationNom} — ${c.seancesFaites}/${c.seancesTotales} séances`}
                    colorClass="bg-sage-pale"
                    icon="calendar"
                    iconClass="bg-sage/20 text-sage-dark"
                    onContact={() => contactMilieuCure(c)}
                    onDismiss={() => handleDismissKey(`cure-mi-${c.id}`)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-border rounded-2xl p-5">
            <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Paliers de fidélité</h3>
            <p className="text-xs text-text-muted mb-4">Tous les 5 massages honorés ou toutes les 8 poses/remplissages de cils.</p>
            {sections.fideliteMassage.length === 0 && sections.fideliteCils.length === 0 ? (
              <p className="text-sm text-text-muted">Aucun palier de fidélité atteint pour le moment.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sections.fideliteMassage.map((m) => (
                  <ContactRow
                    key={`fidelite-massage-${m.id}`}
                    title={m.clienteNom}
                    subtitle={`${m.count}e massage honoré — ${m.recompense}`}
                    colorClass="bg-gold-pale"
                    icon="cake"
                    iconClass="bg-gold/25 text-gold-text"
                    onContact={() => contactFidelite(m)}
                    onDismiss={() => handleDismissKey(`fidelite-massage-${m.id}`)}
                  />
                ))}
                {sections.fideliteCils.map((m) => (
                  <ContactRow
                    key={`fidelite-cils-${m.id}`}
                    title={m.clienteNom}
                    subtitle={`${m.count}e pose/remplissage honoré — ${m.recompense}`}
                    colorClass="bg-gold-pale"
                    icon="cake"
                    iconClass="bg-gold/25 text-gold-text"
                    onContact={() => contactFidelite(m)}
                    onDismiss={() => handleDismissKey(`fidelite-cils-${m.id}`)}
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
            <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Inactives depuis longtemps</h3>
            <p className="text-xs text-text-muted mb-4">Avec une offre de retour, pour les clientes disparues depuis plusieurs mois.</p>
            {sections.inactivesLongues.length === 0 ? (
              <p className="text-sm text-text-muted">Aucune cliente inactive depuis longtemps pour le moment.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sections.inactivesLongues.map(({ client, jours }) => (
                  <ContactRow
                    key={client.id}
                    title={client.nomComplet}
                    subtitle={`Vue il y a ${jours} jours`}
                    colorClass="bg-danger-pale"
                    icon="phone"
                    iconClass="bg-danger/20 text-danger"
                    onContact={() => contactInactiveLongue(client)}
                    onDismiss={() => handleDismissKey(`inactive-${client.id}`)}
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
        <Modal size="sm">
          <h3 className="font-serif text-xl font-semibold text-sage-dark mb-4">Nouveau message</h3>
          <div className="flex items-center bg-sage-pale rounded-[10px] p-0.5 mb-4">
            <button
              type="button"
              onClick={() => setPickerMode('client')}
              className={`flex-1 h-8 rounded-[8px] text-sm font-semibold ${
                pickerMode === 'client' ? 'bg-sage-dark text-white' : 'text-text-muted'
              }`}
            >
              Cliente existante
            </button>
            <button
              type="button"
              onClick={() => setPickerMode('libre')}
              className={`flex-1 h-8 rounded-[8px] text-sm font-semibold ${
                pickerMode === 'libre' ? 'bg-sage-dark text-white' : 'text-text-muted'
              }`}
            >
              Contact sans fiche
            </button>
          </div>

          {pickerMode === 'client' ? (
            <SearchableSelect
              options={state.clients.map((c) => ({ id: c.id, label: c.nomComplet }))}
              value={pickedClientId}
              onChange={setPickedClientId}
              placeholder="Rechercher une cliente..."
              emptyLabel="Aucune cliente trouvée."
            />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-text-muted">
                Pour envoyer le lien de réservation en ligne à quelqu'un qui n'a pas encore de fiche cliente.
              </p>
              <label className="block">
                <span className="block text-xs font-semibold text-text-muted mb-1">Nom (optionnel)</span>
                <input
                  type="text"
                  value={libreNom}
                  onChange={(e) => setLibreNom(e.target.value)}
                  maxLength={200}
                  className="input"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-text-muted mb-1">Téléphone</span>
                <input
                  type="tel"
                  value={libreTelephone}
                  onChange={(e) => setLibreTelephone(e.target.value)}
                  maxLength={30}
                  className="input"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-text-muted mb-1">E-mail</span>
                <input
                  type="email"
                  value={libreEmail}
                  onChange={(e) => setLibreEmail(e.target.value)}
                  className="input"
                />
              </label>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-5">
            <button
              onClick={() => setPickerOpen(false)}
              className="px-4 py-2.5 rounded-[10px] text-sm font-semibold text-text-muted hover:bg-sage-pale"
            >
              Annuler
            </button>
            {pickerMode === 'client' ? (
              <button
                onClick={confirmPickedClient}
                disabled={!pickedClientId}
                className="bg-sage-dark text-white px-5 py-2.5 rounded-[10px] text-sm font-semibold disabled:opacity-50"
              >
                Continuer
              </button>
            ) : (
              <button
                onClick={confirmContactSansFiche}
                disabled={!libreTelephone.trim() && !libreEmail.trim()}
                className="bg-sage-dark text-white px-5 py-2.5 rounded-[10px] text-sm font-semibold disabled:opacity-50"
              >
                Continuer
              </button>
            )}
          </div>
        </Modal>
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
