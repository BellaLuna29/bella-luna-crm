import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dbList, dbCreate, SupabaseConfigError, type DbRow } from './_lib/supabase.js'
import { setCorsHeaders } from './_lib/cors.js'
import { requireAuth, AuthError } from './_lib/auth.js'
import { parseDepenseInput } from './_lib/mappers.js'

const TABLE_DEPENSES = 'depenses'

interface DepenseItem {
  id: string
  date: string | null
  categorie: string
  description: string
  montant: number | null
  recurrente: boolean
  justificatifUrl: string | null
  justificatifNom: string | null
}

function mapRow(r: DbRow): DepenseItem {
  return {
    id: r.id,
    date: (r.date as string) ?? null,
    categorie: (r.categorie as string) ?? '',
    description: (r.description as string) ?? '',
    montant: (r.montant as number) ?? null,
    recurrente: Boolean(r.recurrente),
    justificatifUrl: (r.justificatif_url as string) ?? null,
    justificatifNom: (r.justificatif_nom as string) ?? null,
  }
}

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
      const rows = await dbList(TABLE_DEPENSES, { order: { column: 'date', ascending: false } })
      const depenses = rows.map(mapRow)
      res.status(200).json({ depenses })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les dépenses depuis la base de données.' })
    }
    return
  }

  // POST — create a new dépense
  const parsed = parseDepenseInput(req.body, { requireCore: true })
  if ('errors' in parsed) {
    res.status(400).json({ error: parsed.errors.join(' ') })
    return
  }

  try {
    const row = await dbCreate(TABLE_DEPENSES, parsed.fields)
    res.status(201).json({ id: row.id })
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de créer la dépense dans la base de données.' })
  }
}
