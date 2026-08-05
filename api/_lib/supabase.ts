import { createClient as createClientTyped } from '@supabase/supabase-js'

// See SupabaseLike below: we deliberately erase @supabase/supabase-js's generic
// return type so tsc never instantiates it. Casting through `unknown` skips the
// structural-compatibility check that would otherwise re-trigger the blow-up.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createClient = createClientTyped as unknown as (url: string, key: string, opts?: unknown) => any

export class SupabaseConfigError extends Error {}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The PostgREST query-builder generics in @supabase/supabase-js instantiate to
// an extreme depth when the table name is a plain `string` (not a literal from
// a typed Database schema). Since every helper here takes a dynamic table name,
// that blows up type-checking ("Type instantiation is excessively deep and
// possibly infinite", ts2589) — which fails the build on Vercel. We therefore
// type the client loosely and cast each query's result via the generic <T>.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

let client: SupabaseLike = null

function getClient(): SupabaseLike {
  if (client) return client
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new SupabaseConfigError(
      "Variables d'environnement manquantes : SUPABASE_URL et/ou SUPABASE_SERVICE_ROLE_KEY ne sont pas définies sur Vercel.",
    )
  }
  client = createClient(url, serviceKey, { auth: { persistSession: false } })
  return client
}

export interface DbRow {
  id: string
  [key: string]: unknown
}

export async function dbList<T extends DbRow = DbRow>(
  table: string,
  opts?: { select?: string; order?: { column: string; ascending?: boolean }; eq?: [string, unknown] },
): Promise<T[]> {
  const sb = getClient()
  let query = sb.from(table).select(opts?.select ?? '*')
  if (opts?.eq) query = query.eq(opts.eq[0], opts.eq[1])
  if (opts?.order) query = query.order(opts.order.column, { ascending: opts.order.ascending ?? true })
  const { data, error } = await query
  if (error) throw new Error(`Supabase a répondu une erreur : ${error.message}`)
  return (data ?? []) as T[]
}

export async function dbGet<T extends DbRow = DbRow>(table: string, id: string, select = '*'): Promise<T | null> {
  const sb = getClient()
  const { data, error } = await sb.from(table).select(select).eq('id', id).maybeSingle()
  if (error) throw new Error(`Supabase a répondu une erreur : ${error.message}`)
  return (data as T | null) ?? null
}

export async function dbGetByIds<T extends DbRow = DbRow>(table: string, ids: string[], select = '*'): Promise<T[]> {
  if (ids.length === 0) return []
  const sb = getClient()
  const { data, error } = await sb.from(table).select(select).in('id', ids)
  if (error) throw new Error(`Supabase a répondu une erreur : ${error.message}`)
  return (data ?? []) as T[]
}

export async function dbCreate<T extends DbRow = DbRow>(table: string, fields: Record<string, unknown>): Promise<T> {
  const sb = getClient()
  const { data, error } = await sb.from(table).insert(fields).select().single()
  if (error) throw new Error(`Supabase a répondu une erreur : ${error.message}`)
  return data as T
}

export async function dbUpdate<T extends DbRow = DbRow>(
  table: string,
  id: string,
  fields: Record<string, unknown>,
): Promise<T> {
  const sb = getClient()
  const { data, error } = await sb.from(table).update(fields).eq('id', id).select().single()
  if (error) throw new Error(`Supabase a répondu une erreur : ${error.message}`)
  return data as T
}

export async function dbDelete(table: string, id: string): Promise<void> {
  const sb = getClient()
  const { error } = await sb.from(table).delete().eq('id', id)
  if (error) throw new Error(`Supabase a répondu une erreur : ${error.message}`)
}

/** Bulk delete every row matching a single column filter (e.g. all rendezvous for a cliente_id). */
export async function dbDeleteWhere(table: string, column: string, value: unknown): Promise<void> {
  const sb = getClient()
  const { error } = await sb.from(table).delete().eq(column, value)
  if (error) throw new Error(`Supabase a répondu une erreur : ${error.message}`)
}

/**
 * Uploads a base64-encoded file to Supabase Storage and returns its public
 * URL. Buckets ("depenses-justificatifs", "factures-pdf") must exist and be
 * public — created once via the Supabase dashboard, see supabase/README.md.
 */
export async function dbUploadFile(
  bucket: string,
  path: string,
  base64Data: string,
  contentType: string,
): Promise<{ path: string; publicUrl: string }> {
  const sb = getClient()
  const buffer = Buffer.from(base64Data, 'base64')
  const { error } = await sb.storage.from(bucket).upload(path, buffer, { contentType, upsert: true })
  if (error) throw new Error(`Supabase Storage a répondu une erreur : ${error.message}`)
  const { data } = sb.storage.from(bucket).getPublicUrl(path)
  return { path, publicUrl: data.publicUrl }
}
