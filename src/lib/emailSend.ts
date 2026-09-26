import { apiFetch } from './api'

type GetToken = () => Promise<string | null>

export interface ManualEmailSendPayload {
  to: string
  subject: string
  message: string
  label?: string
}

export async function sendManualEmail(getToken: GetToken, payload: ManualEmailSendPayload): Promise<void> {
  await apiFetch(getToken, '/api/prestations?resource=manual-email-send', {
    method: 'POST',
    body: payload,
  })
}
