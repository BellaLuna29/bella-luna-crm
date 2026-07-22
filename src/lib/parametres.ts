import { apiFetch } from './api'

export interface Parametres {
  horaires: Record<string, string>
  objectifCaMensuel: number | null
}

export const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] as const

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
