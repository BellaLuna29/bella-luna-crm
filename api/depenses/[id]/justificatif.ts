import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dbUploadFile, dbUpdate, SupabaseConfigError, UUID_RE } from '../../_lib/supabase.js'
import { setCorsHeaders } from '../../_lib/cors.js'
import { requireAuth, AuthError } from '../../_lib/auth.js'

const BUCKET = 'depenses-justificatifs'
const MAX_BASE64_LENGTH = 6_000_000 // ~4.5 MB decoded, matches Vercel's request body limit

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
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
    res.status(400).json({ error: 'Identifiant de dépense invalide.' })
    return
  }

  const body = req.body as Record<string, unknown>
  const filename = typeof body?.filename === 'string' ? body.filename.trim() : ''
  const contentType = typeof body?.contentType === 'string' ? body.contentType.trim() : ''
  const dataBase64 = typeof body?.dataBase64 === 'string' ? body.dataBase64 : ''

  if (!filename || !contentType || !dataBase64) {
    res.status(400).json({ error: 'Fichier, nom et type sont obligatoires.' })
    return
  }
  if (dataBase64.length > MAX_BASE64_LENGTH) {
    res.status(400).json({ error: 'Le fichier est trop volumineux (4 Mo maximum).' })
    return
  }

  try {
    const { publicUrl } = await dbUploadFile(BUCKET, `${id}/${filename}`, dataBase64, contentType)
    await dbUpdate('depenses', id, { justificatif_url: publicUrl, justificatif_nom: filename })
    res.status(200).json({ ok: true })
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: "Impossible d'envoyer le justificatif à la base de données." })
  }
}
