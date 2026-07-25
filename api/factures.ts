import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dbList, dbCreate, SupabaseConfigError, type DbRow } from './_lib/supabase.js'
import { setCorsHeaders } from './_lib/cors.js'
import { requireAuth, AuthError } from './_lib/auth.js'
import { parseFactureInput } from './_lib/mappers.js'

const TABLE_FACTURES = 'factures'
const SELECT = '*, cliente:clients(nom_complet), promo:promotions(nom, reduction)'

interface FactureItem {
  id: string
  date: string | null
  montant: number | null
  payee: boolean
  clienteId: string | null
  clienteNom: string
  rendezvousId: string | null
  categorieFacture: string
  promoId: string | null
  promoNom: string
  promoReduction: number | null
  description: string
  notes: string
}

function mapRow(r: DbRow): FactureItem {
  const cliente = r.cliente as { nom_complet?: string } | null
  const promo = r.promo as { nom?: string; reduction?: number } | null
  return {
    id: r.id,
    date: (r.date_facture as string) ?? null,
    montant: (r.montant as number) ?? null,
    payee: Boolean(r.payee),
    clienteId: (r.cliente_id as string) ?? null,
    clienteNom: cliente?.nom_complet ?? '',
    rendezvousId: (r.rendezvous_id as string) ?? null,
    categorieFacture: (r.categorie_facture as string) ?? 'Commercial',
    promoId: (r.promo_id as string) ?? null,
    promoNom: promo?.nom ?? '',
    promoReduction: promo?.reduction ?? null,
    description: (r.description as string) ?? '',
    notes: (r.notes as string) ?? '',
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
      const rows = await dbList(TABLE_FACTURES, { select: SELECT, order: { column: 'date_facture', ascending: false } })
      const factures = rows.map(mapRow)
      res.status(200).json({ factures })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les factures depuis la base de données.' })
    }
    return
  }

  // POST — create a new facture
  const parsed = parseFactureInput(req.body, { requireCore: true })
  if ('errors' in parsed) {
    res.status(400).json({ error: parsed.errors.join(' ') })
    return
  }

  try {
    const row = await dbCreate(TABLE_FACTURES, parsed.fields)
    res.status(201).json({ id: row.id })
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de créer la facture dans la base de données.' })
  }
}
