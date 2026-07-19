import { apiFetch } from './api'

type GetToken = () => Promise<string | null>

export async function fetchLastNewsletterSentAt(getToken: GetToken): Promise<string | null> {
  const data = await apiFetch<{ lastSentAt: string | null }>(getToken, '/api/prestations?resource=newsletter-status')
  return data.lastSentAt
}

export async function recordNewsletterSent(getToken: GetToken): Promise<void> {
  await apiFetch(getToken, '/api/prestations?resource=newsletter-status', { method: 'POST' })
}
