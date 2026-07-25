import { apiFetch } from './api'

type GetToken = () => Promise<string | null>

export interface NewsletterSendResponse {
  sent: number
  failed: number
  error?: string
}

export async function sendNewsletter(
  getToken: GetToken,
  payload: { subject: string; body: string; clientIds: string[] },
): Promise<NewsletterSendResponse> {
  return apiFetch<NewsletterSendResponse>(getToken, '/api/prestations?resource=newsletter-send', {
    method: 'POST',
    body: payload,
  })
}
