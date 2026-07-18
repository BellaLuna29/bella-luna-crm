import type { VercelRequest, VercelResponse } from '@vercel/node'
import { airtableUpdate, AirtableConfigError } from '../_lib/airtable.js'
import { setCorsHeaders } from '../_lib/cors.js'
import { requireAuth, AuthError } from '../_lib/auth.js'
import { parseFactureInput } from '../_lib/mappers.js'

const TABLE_FACTURES = 'tbl3C95q9hjjIVz8W'
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
    res.status(400).json({ error: 'Identifiant de facture invalide.' })
    return
  }

  const parsed = parseFactureInput(req.body, { requireCore: false })
  if ('errors' in parsed) {
    res.status(400).json({ error: parsed.errors.join(' ') })
    return
  }

  try {
    const updated = await airtableUpdate(TABLE_FACTURES, id, parsed.fields)
    res.status(200).json({
      id: updated.id,
      montant: (updated.fields['Montant'] as number) ?? null,
      payee: Boolean(updated.fields['Payée']),
      date: (updated.fields['Date de facture'] as string) ?? null,
    })
  } catch (error) {
    if (error instanceof AirtableConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de mettre à jour la facture dans Airtable.' })
  }
}
