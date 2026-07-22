import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dbList, dbCreate, SupabaseConfigError } from './_lib/supabase.js'
import { setCorsHeaders } from './_lib/cors.js'
import { requireAuth, AuthError } from './_lib/auth.js'
import { mapClient, parseClientInput } from './_lib/mappers.js'

const TABLE_CLIENTS = 'clients'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée.' })
    return
  }

  try {
    await requireAuth(req)
  } catch (error) {
    res.status(401).json({ error: error instanceof AuthError ? error.message : 'Authentification requise.' })
    return
  }

  if (req.method === 'GET') {
    try {
      const rows = await dbList(TABLE_CLIENTS, { order: { column: 'nom_complet' } })
      const clients = rows.map(mapClient)
      res.status(200).json({ clients })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les clientes depuis la base de données.' })
    }
    return
  }

  // POST — create a new client
  const parsed = parseClientInput(req.body, { requireName: true })
  if ('errors' in parsed) {
    res.status(400).json({ error: parsed.errors.join(' ') })
    return
  }

  try {
    const row = await dbCreate(TABLE_CLIENTS, parsed.fields)
    res.status(201).json({ client: mapClient(row) })
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de créer la cliente dans la base de données.' })
  }
}
