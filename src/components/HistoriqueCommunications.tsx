import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { ApiError } from '../lib/api'
import { fetchCommunicationsLog, type CommunicationLogItem } from '../lib/communicationsLog'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; communications: CommunicationLogItem[] }

const TYPE_STYLES: Record<string, string> = {
  SMS: 'bg-sage-light text-sage-dark',
  Email: 'bg-avatar-indigo/15 text-avatar-indigo',
  Newsletter: 'bg-gold-pale text-gold-text',
}

function formatDateHeure(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function HistoriqueCommunications() {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })

  const load = useCallback(() => {
    setState({ status: 'loading' })
    fetchCommunicationsLog(getToken)
      .then((communications) => setState({ status: 'success', communications }))
      .catch((error: unknown) => {
        setState({ status: 'error', message: error instanceof ApiError ? error.message : 'Erreur inconnue.' })
      })
  }, [getToken])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden">
      {state.status === 'loading' && <p className="p-6 text-sm text-text-muted">Chargement…</p>}
      {state.status === 'error' && <p className="p-6 text-sm text-danger">{state.message}</p>}

      {state.status === 'success' && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Type', 'Contenu', 'Envoyé le', 'Destinataires'].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[11px] text-text-muted font-semibold uppercase tracking-wide px-4 pb-2.5 pt-4 border-b border-border"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.communications.map((c) => (
                <tr key={c.id} className="hover:bg-sage-pale transition-colors">
                  <td className="px-4 py-3 border-b border-sage-light">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full inline-block ${TYPE_STYLES[c.type] ?? 'bg-sage-light text-sage-dark'}`}>
                      {c.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 border-b border-sage-light text-sm truncate max-w-md">{c.contenu}</td>
                  <td className="px-4 py-3 border-b border-sage-light text-sm text-text-muted whitespace-nowrap">
                    {formatDateHeure(c.dateEnvoi)}
                  </td>
                  <td className="px-4 py-3 border-b border-sage-light text-sm">{c.destinataires}</td>
                </tr>
              ))}
              {state.communications.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-muted">
                    Aucun envoi enregistré pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default HistoriqueCommunications
