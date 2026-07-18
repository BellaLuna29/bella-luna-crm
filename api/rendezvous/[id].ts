import type { VercelRequest, VercelResponse } from '@vercel/node'
import { airtableUpdate, AirtableConfigError } from '../_lib/airtable.js'
import { setCorsHeaders } from '../_lib/cors.js'
import { requireAuth, AuthError } from '../_lib/auth.js'
import { parseRendezVousInput } from '../_lib/mappers.js'

const TABLE_RENDEZVOUS = 'tblFF89VWARwjPxus'
const RECORD_ID_RE = /^rec[a-zA-Z0-9]{14}$/

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'PATCH') {
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
    res.status(400).json({ error: 'Identifiant de rendez-vous invalide.' })
    return
  }

  const parsed = parseRendezVousInput(req.body, { requireCore: false })
  if ('errors' in parsed) {
    res.status(400).json({ error: parsed.errors.join(' ') })
    return
  }

  try {
    const updated = await airtableUpdate(TABLE_RENDEZVOUS, id, parsed.fields)
    res.status(200).json({ id: updated.id, notes: (updated.fields['Notes du RDV'] as string) ?? '' })
  } catch (error) {
    if (error instanceof AirtableConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de mettre à jour le rendez-vous dans Airtable.' })
  }
}
