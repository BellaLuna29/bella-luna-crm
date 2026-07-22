import { apiFetch } from './api'

export interface CommunicationLogItem {
  id: string
  contenu: string
  type: string
  destinataires: number
  dateEnvoi: string | null
}

type GetToken = () => Promise<string | null>

export async function fetchCommunicationsLog(getToken: GetToken): Promise<CommunicationLogItem[]> {
  const data = await apiFetch<{ communications: CommunicationLogItem[] }>(
    getToken,
    '/api/prestations?resource=communications-log',
  )
  return data.communications
}

export async function logCommunication(
  getToken: GetToken,
  entry: { contenu: string; type: 'SMS' | 'Email' | 'Newsletter'; destinataires: number },
): Promise<void> {
  await apiFetch(getToken, '/api/prestations?resource=communications-log', {
    method: 'POST',
    body: entry,
  })
}
