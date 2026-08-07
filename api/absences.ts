import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dbList, dbCreate, dbDelete, SupabaseConfigError, UUID_RE, type DbRow } from './_lib/supabase.js'
import { setCorsHeaders } from './_lib/cors.js'
import { requireAuth, AuthError } from './_lib/auth.js'
import { parseAbsenceInput } from './_lib/mappers.js'

const TABLE_ABSENCES = 'absences'

interface AbsenceItem {
  id: string
  libelle: string
  dateDebut: string | null
  dateFin: string | null
  type: string
  demiJournee: string | null
}

function mapRow(r: DbRow): AbsenceItem {
  return {
    id: r.id,
    libelle: (r.libelle as string) ?? '',
    dateDebut: (r.date_debut as string) ?? null,
    dateFin: (r.date_fin as string) ?? null,
    type: (r.type as string) ?? 'Vacances',
    demiJournee: (r.demi_journee as string) ?? null,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'DELETE') {
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
      const rows = await dbList(TABLE_ABSENCES, { order: { column: 'date_debut' } })
      const absences = rows.map(mapRow)
      res.status(200).json({ absences })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les absences depuis la base de données.' })
    }
    return
  }

  if (req.method === 'DELETE') {
    const id = req.query.id
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      res.status(400).json({ error: 'Identifiant invalide.' })
      return
    }
    try {
      await dbDelete(TABLE_ABSENCES, id)
      res.status(200).json({ ok: true })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: "Impossible de supprimer l'absence dans la base de données." })
    }
    return
  }

  // POST — create a new absence
  const parsed = parseAbsenceInput(req.body, { requireCore: true })
  if ('errors' in parsed) {
    res.status(400).json({ error: parsed.errors.join(' ') })
    return
  }

  try {
    const row = await dbCreate(TABLE_ABSENCES, parsed.fields)
    res.status(201).json({ id: row.id })
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: "Impossible de créer l'absence dans la base de données." })
  }
}
