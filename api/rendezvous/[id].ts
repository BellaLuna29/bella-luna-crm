import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dbUpdate, dbList, dbCreate, dbGet, SupabaseConfigError, UUID_RE } from '../_lib/supabase.js'
import { setCorsHeaders } from '../_lib/cors.js'
import { requireAuth, AuthError } from '../_lib/auth.js'
import { parseRendezVousInput } from '../_lib/mappers.js'
import { cureTotalSeances, cureCyclePosition } from '../_lib/cure.js'

const TABLE_RENDEZVOUS = 'rendezvous'
const TABLE_FACTURES = 'factures'
const TABLE_PRESTATIONS = 'prestations'

/**
 * A RDV marked "Honoré" should always end up with a facture — rather than
 * asking her to create one by hand every time. Guards against duplicates via
 * factures.rendezvous_id (one invoice per appointment). Best-effort: a
 * failure here must not fail the status update itself.
 *
 * For "Cure X séances"/"Passeport" prestations, the price is for the whole
 * package, paid once — so only the first session of each cycle gets
 * invoiced. Sessions 2..X of an already-started cure/passeport are skipped;
 * once a cycle completes, the next session starts a new cycle and is
 * invoiced again (a genuine new purchase).
 */
async function ensureFactureForRendezVous(rdvId: string): Promise<void> {
  const existing = await dbList(TABLE_FACTURES, { eq: ['rendezvous_id', rdvId] })
  if (existing.length > 0) return

  const rdv = await dbGet(TABLE_RENDEZVOUS, rdvId)
  if (!rdv) return

  const prestation = rdv.prestation_id ? await dbGet(TABLE_PRESTATIONS, rdv.prestation_id as string) : null

  const total = prestation ? cureTotalSeances((prestation.type as string) ?? '') : null
  if (total && rdv.cliente_id) {
    const clientRdvRows = await dbList(TABLE_RENDEZVOUS, { eq: ['cliente_id', rdv.cliente_id as string] })
    const priorHonoreCount = clientRdvRows.filter(
      (r) => r.id !== rdvId && r.prestation_id === rdv.prestation_id && r.statut === 'Honoré',
    ).length
    if (cureCyclePosition(priorHonoreCount, total) > 1) return
  }

  const dateStr = typeof rdv.date === 'string' ? rdv.date.slice(0, 10) : new Date().toISOString().slice(0, 10)

  await dbCreate(TABLE_FACTURES, {
    cliente_id: rdv.cliente_id ?? null,
    rendezvous_id: rdv.id,
    montant: (prestation?.prix as number) ?? 0,
    date_facture: dateStr,
    payee: false,
    categorie_facture: 'Commercial',
    description: (prestation?.nom as string) ?? '',
  })
}

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
    res.status(400).json({ error: 'Identifiant de rendez-vous invalide.' })
    return
  }

  const parsed = parseRendezVousInput(req.body, { requireCore: false })
  if ('errors' in parsed) {
    res.status(400).json({ error: parsed.errors.join(' ') })
    return
  }

  try {
    const updated = await dbUpdate(TABLE_RENDEZVOUS, id, parsed.fields)
    if (parsed.fields.statut === 'Honoré') {
      try {
        await ensureFactureForRendezVous(id)
      } catch (factureError) {
        console.error('Auto-facture generation failed:', factureError)
      }
    }
    res.status(200).json({ id: updated.id, notes: (updated.notes as string) ?? '' })
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de mettre à jour le rendez-vous dans la base de données.' })
  }
}
