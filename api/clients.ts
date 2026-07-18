import type { VercelRequest, VercelResponse } from '@vercel/node'
import { airtableList, airtableCreate, AirtableConfigError } from './_lib/airtable.js'
import { setCorsHeaders } from './_lib/cors.js'
import { requireAuth, AuthError } from './_lib/auth.js'
import { mapClient, parseClientInput } from './_lib/mappers.js'

const TABLE_CLIENTES = 'tblMKV5WKQ7jtwXq4'

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
      const records = await airtableList(TABLE_CLIENTES)
      const clients = records.map(mapClient)
      res.status(200).json({ clients })
    } catch (error) {
      if (error instanceof AirtableConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les clientes depuis Airtable.' })
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
    const record = await airtableCreate(TABLE_CLIENTES, parsed.fields)
    res.status(201).json({ client: mapClient(record) })
  } catch (error) {
    if (error instanceof AirtableConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de créer la cliente dans Airtable.' })
  }
}
