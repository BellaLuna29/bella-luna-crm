import { apiFetch } from './api'

export interface Parametres {
  objectifCaMensuel: number | null
  seuilRecontactJours: number
  seuilFactureImpayeeJours: number
  seuilPromoExpirationJours: number
  seuilNewsletterJours: number
  seuilAnniversaireJours: number
  seuilInactiviteLongueJours: number
  rappelsAutoActifs: boolean
  /** Délai minimum entre maintenant et un créneau réservable en ligne. */
  reservationDelaiMinHeures: number
  /** Jusqu'à combien de jours à l'avance une cliente peut réserver en ligne. */
  reservationMaxJours: number
}

type GetToken = () => Promise<string | null>

export async function fetchParametres(getToken: GetToken): Promise<Parametres> {
  const data = await apiFetch<{ parametres: Parametres }>(getToken, '/api/prestations?resource=parametres')
  return data.parametres
}

export async function saveParametres(
  getToken: GetToken,
  updates: Partial<Parametres>,
): Promise<Parametres> {
  const data = await apiFetch<{ parametres: Parametres }>(getToken, '/api/prestations?resource=parametres', {
    method: 'PATCH',
    body: updates,
  })
  return data.parametres
}
