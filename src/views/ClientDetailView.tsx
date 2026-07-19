import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import StatusPill from '../components/StatusPill'
import ClientFormModal from '../components/ClientFormModal'
import RdvHistoryRow from '../components/RdvHistoryRow'
import MessageComposerModal from '../components/MessageComposerModal'
import RdvFormModal from '../components/RdvFormModal'

function buildTelLink(telephone: string): string {
  return `tel:${telephone.replace(/[^\d+]/g, '')}`
}

interface Client {
  id: string
  nomComplet: string
  telephone: string
  email: string
  dateNaissance: string | null
  metier: string
  categorieMetier: string
  hobbies: string
  notes: string
  statut: string
}

interface HistoriqueItem {
  id: string
  date: string | null
  statut: string
  prestation: string
  prix: number | null
  notes: string
}

interface FactureItem {
  id: string
  date: string | null
  montant: number | null
  payee: boolean
}

interface CureItem {
  id: string
  nom: string
  seancesTotales: number
  seancesFaites: number
}

interface DetailResponse {
  client: Client
  historique: HistoriqueItem[]
  factures: FactureItem[]
  cures: CureItem[]
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: DetailResponse }

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function formatDateFr(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatMontant(value: number | null): string {
  if (value === null) return '—'
  return `${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

interface ClientDetailViewProps {
  clientId: string
  onBack: () => void
}

function ClientDetailView({ clientId, onBack }: ClientDetailViewProps) {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [tab, setTab] = useState<'historique' | 'factures'>('historique')
  const [showEdit, setShowEdit] = useState(false)
  const [showContact, setShowContact] = useState(false)
  const [showNewRdv, setShowNewRdv] = useState(false)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    apiFetch<DetailResponse>(getToken, `/api/clients/${clientId}`)
      .then((data) => {
        setState({ status: 'success', data })
      })
      .catch((error: unknown) => {
        setState({
          status: 'error',
          message: error instanceof ApiError ? error.message : 'Erreur inconnue.',
        })
      })
  }, [getToken, clientId])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="text-sm text-text-muted hover:text-sage-dark font-medium"
        >
          ← Retour aux clientes
        </button>
        {state.status === 'success' && (
          <div className="flex items-center gap-2 flex-wrap">
            {state.data.client.telephone && (
              <a
                href={buildTelLink(state.data.client.telephone)}
                className="bg-white border border-border text-sage-dark px-4 py-2 rounded-[10px] text-sm font-semibold hover:bg-sage-pale"
              >
                📞 Appeler
              </a>
            )}
            <button
              onClick={() => setShowContact(true)}
              className="bg-white border border-border text-sage-dark px-4 py-2 rounded-[10px] text-sm font-semibold hover:bg-sage-pale"
            >
              Contacter
            </button>
            <button
              onClick={() => setShowNewRdv(true)}
              className="bg-white border border-border text-sage-dark px-4 py-2 rounded-[10px] text-sm font-semibold hover:bg-sage-pale"
            >
              Nouveau RDV
            </button>
            <button
              onClick={() => setShowEdit(true)}
              className="bg-white border border-border text-sage-dark px-4 py-2 rounded-[10px] text-sm font-semibold hover:bg-sage-pale"
            >
              Modifier
            </button>
          </div>
        )}
      </div>

      {state.status === 'loading' && <p className="text-sm text-text-muted">Chargement…</p>}
      {state.status === 'error' && <p className="text-sm text-danger">{state.message}</p>}

      {state.status === 'success' && (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 items-start">
          <div className="bg-white border border-border rounded-2xl p-6 text-center">
            <div className="w-18 h-18 rounded-full bg-sage-light text-sage-dark flex items-center justify-center font-serif font-semibold text-2xl mx-auto mb-3.5">
              {initials(state.data.client.nomComplet)}
            </div>
            <div className="font-serif text-lg font-semibold">{state.data.client.nomComplet}</div>
            <div className="mt-2 flex justify-center">
              <StatusPill statut={state.data.client.statut} />
            </div>

            <div className="mt-5 text-left flex flex-col gap-3 text-sm">
              <div>
                <div className="text-[11px] text-text-muted font-medium">Téléphone</div>
                <div>{state.data.client.telephone || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] text-text-muted font-medium">E-mail</div>
                <div>{state.data.client.email || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] text-text-muted font-medium">Date de naissance</div>
                <div>{formatDateFr(state.data.client.dateNaissance)}</div>
              </div>
              <div>
                <div className="text-[11px] text-text-muted font-medium">Métier</div>
                <div>
                  {state.data.client.metier || '—'}
                  {state.data.client.categorieMetier && (
                    <span className="ml-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-sage-light text-sage-dark">
                      {state.data.client.categorieMetier}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-text-muted font-medium">Hobbies / Sport</div>
                <div>{state.data.client.hobbies || '—'}</div>
              </div>
            </div>

            {state.data.client.notes && (
              <div className="mt-4.5 bg-sage-pale rounded-[10px] p-3.5 text-left">
                <div className="text-[11px] text-sage-dark font-semibold uppercase tracking-wide mb-1">
                  Note personnelle
                </div>
                <div className="text-sm leading-relaxed">{state.data.client.notes}</div>
              </div>
            )}

            {state.data.cures.map((cure) => (
              <div key={cure.id} className="mt-4.5 text-left">
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span>{cure.nom}</span>
                  <span>
                    {cure.seancesFaites} / {cure.seancesTotales}
                  </span>
                </div>
                <div className="h-2 bg-sage-light rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gold rounded-full"
                    style={{
                      width: `${cure.seancesTotales > 0 ? Math.min(100, (cure.seancesFaites / cure.seancesTotales) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div>
            <div className="flex gap-4.5 mb-4 border-b border-border">
              <button
                onClick={() => setTab('historique')}
                className={`pb-2.5 text-sm font-semibold border-b-2 -mb-px ${
                  tab === 'historique'
                    ? 'text-sage-dark border-sage-dark'
                    : 'text-text-muted border-transparent'
                }`}
              >
                Historique des rendez-vous
              </button>
              <button
                onClick={() => setTab('factures')}
                className={`pb-2.5 text-sm font-semibold border-b-2 -mb-px ${
                  tab === 'factures'
                    ? 'text-sage-dark border-sage-dark'
                    : 'text-text-muted border-transparent'
                }`}
              >
                Factures
              </button>
            </div>

            <div className="bg-white border border-border rounded-2xl p-5">
              {tab === 'historique' &&
                (state.data.historique.length === 0 ? (
                  <p className="text-sm text-text-muted">Aucun rendez-vous enregistré.</p>
                ) : (
                  state.data.historique.map((item) => (
                    <RdvHistoryRow
                      key={item.id}
                      id={item.id}
                      date={formatDateFr(item.date)}
                      prestation={item.prestation || 'Prestation inconnue'}
                      prix={formatMontant(item.prix)}
                      initialNotes={item.notes}
                      isUpcoming={item.date !== null && new Date(item.date).getTime() > Date.now()}
                    />
                  ))
                ))}

              {tab === 'factures' &&
                (state.data.factures.length === 0 ? (
                  <p className="text-sm text-text-muted">Aucune facture enregistrée.</p>
                ) : (
                  state.data.factures.map((facture) => (
                    <div
                      key={facture.id}
                      className="flex justify-between items-center py-3 border-b border-sage-light last:border-none"
                    >
                      <div>
                        <div className="text-xs text-text-muted">{formatDateFr(facture.date)}</div>
                        <div className="text-sm font-semibold">
                          {facture.payee ? 'Payée' : 'Non payée'}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-sage-dark">
                        {formatMontant(facture.montant)}
                      </div>
                    </div>
                  ))
                ))}
            </div>
          </div>
        </div>
      )}

      {showEdit && state.status === 'success' && (
        <ClientFormModal
          mode="edit"
          clientId={clientId}
          initialValues={{
            nomComplet: state.data.client.nomComplet,
            telephone: state.data.client.telephone,
            email: state.data.client.email,
            dateNaissance: state.data.client.dateNaissance ?? '',
            metier: state.data.client.metier,
            categorieMetier: state.data.client.categorieMetier,
            hobbies: state.data.client.hobbies,
            notes: state.data.client.notes,
            statut: state.data.client.statut,
          }}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false)
            load()
          }}
        />
      )}

      {showContact && state.status === 'success' && (
        <MessageComposerModal
          context={{ nomComplet: state.data.client.nomComplet }}
          telephone={state.data.client.telephone}
          email={state.data.client.email}
          onClose={() => setShowContact(false)}
        />
      )}

      {showNewRdv && (
        <RdvFormModal
          mode="create"
          initialValues={{ clienteId: clientId }}
          onClose={() => setShowNewRdv(false)}
          onSaved={() => {
            setShowNewRdv(false)
            load()
          }}
        />
      )}
    </div>
  )
}

export default ClientDetailView
