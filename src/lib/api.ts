export class ApiError extends Error {}

interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Force un aller-retour réseau même si la réponse est encore en cache. */
  fresh?: boolean
}

/**
 * Cache mémoire très court sur les GET. Chaque vue recharge l'intégralité de
 * ses données au montage (clientes, rendez-vous, factures…), si bien qu'un
 * simple aller-retour Agenda → Statistiques refait une dizaine d'appels déjà
 * obtenus quelques secondes plus tôt. On garde donc les GET un court instant,
 * et toute écriture vide le cache : ce qu'elle vient de modifier est toujours
 * rechargé, seul un changement venu d'ailleurs peut attendre jusqu'à la TTL.
 */
const TTL_MS = 30_000
const cache = new Map<string, { at: number; data: unknown }>()
/** Requêtes en vol, pour que deux vues demandant la même chose n'appellent qu'une fois. */
const enVol = new Map<string, Promise<unknown>>()

export function viderCacheApi(): void {
  cache.clear()
  enVol.clear()
}

export async function apiFetch<T>(
  getToken: () => Promise<string | null>,
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL
  if (!baseUrl) {
    throw new ApiError("VITE_API_BASE_URL n'est pas défini dans .env.local.")
  }

  const method = options.method ?? 'GET'
  if (method !== 'GET') {
    // Une écriture rend tout le reste potentiellement faux (une facture créée
    // change aussi le tableau de bord, les stats, la compta…). On repart de zéro.
    viderCacheApi()
  } else if (!options.fresh) {
    const enCache = cache.get(path)
    if (enCache && Date.now() - enCache.at < TTL_MS) return enCache.data as T
    const dejaEnCours = enVol.get(path)
    if (dejaEnCours) return dejaEnCours as Promise<T>
  }

  const promesse = executer<T>(getToken, baseUrl, path, method, options.body)
  if (method === 'GET') {
    enVol.set(path, promesse)
    promesse
      .then((data) => cache.set(path, { at: Date.now(), data }))
      .catch(() => undefined)
      .finally(() => enVol.delete(path))
  }
  return promesse
}

async function executer<T>(
  getToken: () => Promise<string | null>,
  baseUrl: string,
  path: string,
  method: string,
  body: unknown,
): Promise<T> {
  const token = await getToken()
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new ApiError(
      `Le serveur a renvoyé une réponse inattendue (erreur ${response.status}). Réessaie dans un instant.`,
    )
  }

  if (!response.ok) {
    const message = typeof (data as { error?: unknown })?.error === 'string' ? (data as { error: string }).error : undefined
    throw new ApiError(message ?? `Erreur ${response.status}`)
  }
  return data as T
}
