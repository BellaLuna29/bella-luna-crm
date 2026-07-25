import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dbGet, dbUpdate, dbDelete, dbList, dbGetByIds, SupabaseConfigError, UUID_RE } from '../_lib/supabase.js'
import { setCorsHeaders } from '../_lib/cors.js'
import { requireAuth, AuthError } from '../_lib/auth.js'
import { mapClient, parseClientInput } from '../_lib/mappers.js'

const TABLE_CLIENTS = 'clients'
const TABLE_RENDEZVOUS = 'rendezvous'
const TABLE_PRESTATIONS = 'prestations'
const TABLE_FACTURES = 'factures'

const CURE_TYPE_RE = /cure\s+(\d+)\s*s[ée]ances?/i

interface HistoriqueItem {
  id: string
  date: string | null
  statut: string
  prestation: string
  prix: number | null
  notes: string
}

interface FactureItem {
  id: string
  date: string | null
  montant: number | null
  payee: boolean
}

interface CureItem {
  id: string
  nom: string
  seancesTotales: number
  seancesFaites: number
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'GET' && req.method !== 'PATCH' && req.method !== 'DELETE') {
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
    res.status(400).json({ error: 'Identifiant de cliente invalide.' })
    return
  }

  if (req.method === 'PATCH') {
    const parsed = parseClientInput(req.body, { requireName: false })
    if ('errors' in parsed) {
      res.status(400).json({ error: parsed.errors.join(' ') })
      return
    }
    try {
      const updated = await dbUpdate(TABLE_CLIENTS, id, parsed.fields)
      res.status(200).json({ client: mapClient(updated) })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de mettre à jour la cliente dans la base de données.' })
    }
    return
  }

  if (req.method === 'DELETE') {
    try {
      const [rdvRows, factureRows] = await Promise.all([
        dbList(TABLE_RENDEZVOUS, { select: 'id', eq: ['cliente_id', id] }),
        dbList(TABLE_FACTURES, { select: 'id', eq: ['cliente_id', id] }),
      ])
      if (rdvRows.length > 0 || factureRows.length > 0) {
        res.status(409).json({
          error: `Impossible de supprimer : cette cliente a ${rdvRows.length} rendez-vous et ${factureRows.length} facture(s) enregistrés. Passez plutôt son statut à « Inactive ».`,
        })
        return
      }
      await dbDelete(TABLE_CLIENTS, id)
      res.status(200).json({ ok: true })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de supprimer la cliente dans la base de données.' })
    }
    return
  }

  try {
    const clientRow = await dbGet(TABLE_CLIENTS, id)
    if (!clientRow) {
      res.status(404).json({ error: 'Cliente introuvable.' })
      return
    }

    const [rdvRows, factureRows] = await Promise.all([
      dbList(TABLE_RENDEZVOUS, { eq: ['cliente_id', id], order: { column: 'date', ascending: false } }),
      dbList(TABLE_FACTURES, { eq: ['cliente_id', id], order: { column: 'date_facture', ascending: false } }),
    ])

    const prestationIds = Array.from(
      new Set(rdvRows.map((r) => r.prestation_id as string | null).filter((v): v is string => Boolean(v))),
    )
    const prestationRows = await dbGetByIds(TABLE_PRESTATIONS, prestationIds)
    const prestationMap = new Map(prestationRows.map((p) => [p.id, p]))

    const historique: HistoriqueItem[] = rdvRows.map((r) => {
      const prestationId = r.prestation_id as string | null
      const prestation = prestationId ? prestationMap.get(prestationId) : undefined
      return {
        id: r.id,
        date: (r.date as string) ?? null,
        statut: (r.statut as string) ?? '',
        prestation: (prestation?.nom as string) ?? '',
        prix: (prestation?.prix as number) ?? null,
        notes: (r.notes as string) ?? '',
      }
    })

    const factures: FactureItem[] = factureRows.map((f) => ({
      id: f.id,
      date: (f.date_facture as string) ?? null,
      montant: (f.montant as number) ?? null,
      payee: Boolean(f.payee),
    }))

    // Séances de cure calculées automatiquement à partir de l'historique RDV
    // (une "Prestation" de type "Cure X séances" réservée plusieurs fois),
    // plutôt que d'une table dédiée maintenue à la main.
    const cureProgress = new Map<string, CureItem>()
    for (const r of rdvRows) {
      const prestationId = r.prestation_id as string | null
      const prestation = prestationId ? prestationMap.get(prestationId) : undefined
      const type = (prestation?.type as string) ?? ''
      const match = CURE_TYPE_RE.exec(type)
      if (!prestationId || !prestation || !match) continue
      const total = Number(match[1])
      if (!Number.isFinite(total) || total <= 0) continue

      const entry = cureProgress.get(prestationId) ?? {
        id: prestationId,
        nom: (prestation.nom as string) ?? '',
        seancesTotales: total,
        seancesFaites: 0,
      }
      if (r.statut === 'Honoré') entry.seancesFaites += 1
      cureProgress.set(prestationId, entry)
    }
    const cures: CureItem[] = Array.from(cureProgress.values()).filter((c) => c.seancesFaites < c.seancesTotales)

    res.status(200).json({
      client: mapClient(clientRow),
      historique,
      factures,
      cures,
    })
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de récupérer la fiche cliente depuis la base de données.' })
  }
}
