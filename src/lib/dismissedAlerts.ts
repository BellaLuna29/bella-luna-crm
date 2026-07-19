import { apiFetch } from './api'

export interface DismissedAlert {
  id: string
  cle: string
}

type GetToken = () => Promise<string | null>

export async function fetchDismissedAlerts(getToken: GetToken): Promise<DismissedAlert[]> {
  const data = await apiFetch<{ dismissedAlerts: DismissedAlert[] }>(
    getToken,
    '/api/prestations?resource=dismissed-alerts',
  )
  return data.dismissedAlerts
}

export async function dismissAlertKey(getToken: GetToken, cle: string): Promise<void> {
  await apiFetch(getToken, '/api/prestations?resource=dismissed-alerts', {
    method: 'POST',
    body: { cle },
  })
}

/**
 * Deletes dismissed-alert records whose underlying condition no longer
 * applies (the key isn't in `currentValidKeys` anymore — e.g. the facture
 * got paid, the promo expired, the cure finished), so the table doesn't
 * accumulate stale rows forever. Returns the still-relevant dismissed keys.
 */
export async function reconcileDismissedAlerts(
  getToken: GetToken,
  dismissed: DismissedAlert[],
  currentValidKeys: Set<string>,
): Promise<Set<string>> {
  const stillValid = new Set<string>()
  const obsoleteIds: string[] = []

  for (const d of dismissed) {
    if (currentValidKeys.has(d.cle)) stillValid.add(d.cle)
    else obsoleteIds.push(d.id)
  }

  if (obsoleteIds.length > 0) {
    await Promise.all(
      obsoleteIds.map((id) =>
        apiFetch(getToken, `/api/prestations?resource=dismissed-alerts&id=${id}`, { method: 'DELETE' }).catch(
          () => undefined,
        ),
      ),
    )
  }

  return stillValid
}
