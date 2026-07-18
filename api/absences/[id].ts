import type { VercelRequest, VercelResponse } from '@vercel/node'
import { airtableDelete, AirtableConfigError } from '../_lib/airtable.js'
import { setCorsHeaders } from '../_lib/cors.js'
import { requireAuth, AuthError } from '../_lib/auth.js'

const RECORD_ID_RE = /^rec[a-zA-Z0-9]{14}$/
const TABLE_ABSENCES = 'tblW0nybKAtbpDBcV'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'DELETE') {
    res.status(405).json({ error: 'Méthode non autorisée.' })
    return
  }

  try {
    await requireAuth(req)
  } catch (error) {
    res.status(401).json({ error: error instanceof AuthError ? error.message : 'Authentification requise.' })
    return
  }

  const id = req.query.id
  if (typeof id !== 'string' || !RECORD_ID_RE.test(id)) {
    res.status(400).json({ error: 'Identifiant invalide.' })
    return
  }

  try {
    await airtableDelete(TABLE_ABSENCES, id)
    res.status(200).json({ ok: true })
  } catch (error) {
    if (error instanceof AirtableConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: "Impossible de supprimer l'absence dans Airtable." })
  }
}
