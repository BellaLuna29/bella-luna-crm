import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dbUpdate, SupabaseConfigError, UUID_RE } from '../_lib/supabase.js'
import { setCorsHeaders } from '../_lib/cors.js'
import { requireAuth, AuthError } from '../_lib/auth.js'
import { parseFactureInput } from '../_lib/mappers.js'

const TABLE_FACTURES = 'factures'

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
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    res.status(400).json({ error: 'Identifiant de facture invalide.' })
    return
  }

  const parsed = parseFactureInput(req.body, { requireCore: false })
  if ('errors' in parsed) {
    res.status(400).json({ error: parsed.errors.join(' ') })
    return
  }

  try {
    const updated = await dbUpdate(TABLE_FACTURES, id, parsed.fields)
    res.status(200).json({
      id: updated.id,
      montant: (updated.montant as number) ?? null,
      payee: Boolean(updated.payee),
      date: (updated.date_facture as string) ?? null,
    })
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de mettre à jour la facture dans la base de données.' })
  }
}
