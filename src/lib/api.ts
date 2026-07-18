export class ApiError extends Error {}

interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
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

  const token = await getToken()
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  const data = await response.json()
  if (!response.ok) {
    throw new ApiError(data.error ?? `Erreur ${response.status}`)
  }
  return data as T
}
