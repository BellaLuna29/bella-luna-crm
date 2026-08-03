import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dbList, dbCreate, SupabaseConfigError, type DbRow } from './_lib/supabase.js'
import { setCorsHeaders } from './_lib/cors.js'
import { requireAuth, AuthError } from './_lib/auth.js'
import { parseRendezVousInput } from './_lib/mappers.js'

const TABLE_RENDEZVOUS = 'rendezvous'
const SELECT = '*, cliente:clients(nom_complet), prestation:prestations(nom, prix, duree, categorie)'

interface RdvItem {
  id: string
  date: string | null
  statut: string
  notes: string
  clienteId: string | null
  clienteNom: string
  prestationId: string | null
  prestationNom: string
  prestationCategorie: string
  prix: number | null
  duree: string
  serieId: string | null
}

function mapRow(r: DbRow): RdvItem {
  const cliente = r.cliente as { nom_complet?: string } | null
  const prestation = r.prestation as { nom?: string; prix?: number; duree?: string; categorie?: string } | null
  return {
    id: r.id,
    date: (r.date as string) ?? null,
    statut: (r.statut as string) ?? '',
    notes: (r.notes as string) ?? '',
    clienteId: (r.cliente_id as string) ?? null,
    clienteNom: cliente?.nom_complet ?? '',
    prestationId: (r.prestation_id as string) ?? null,
    prestationNom: prestation?.nom ?? '',
    prestationCategorie: prestation?.categorie ?? '',
    prix: prestation?.prix ?? null,
    duree: prestation?.duree ?? '',
    serieId: (r.serie_id as string) ?? null,
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
      const rows = await dbList(TABLE_RENDEZVOUS, { select: SELECT })
      const rendezvous = rows.map(mapRow)
      res.status(200).json({ rendezvous })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les rendez-vous depuis la base de données.' })
    }
    return
  }

  // POST — create a new rendez-vous
  const parsed = parseRendezVousInput(req.body, { requireCore: true })
  if ('errors' in parsed) {
    res.status(400).json({ error: parsed.errors.join(' ') })
    return
  }

  try {
    const row = await dbCreate(TABLE_RENDEZVOUS, parsed.fields)
    res.status(201).json({ id: row.id })
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de créer le rendez-vous dans la base de données.' })
  }
}
