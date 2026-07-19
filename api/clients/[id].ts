import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  airtableGetRecord,
  airtableGetByIds,
  airtableUpdate,
  AirtableConfigError,
  type AirtableRecord,
} from '../_lib/airtable.js'
import { setCorsHeaders } from '../_lib/cors.js'
import { requireAuth, AuthError } from '../_lib/auth.js'
import { mapClient, parseClientInput } from '../_lib/mappers.js'

const RECORD_ID_RE = /^rec[a-zA-Z0-9]{14}$/

const TABLE_CLIENTES = 'tblMKV5WKQ7jtwXq4'
const TABLE_RENDEZVOUS = 'tblFF89VWARwjPxus'
const TABLE_PRESTATIONS = 'tblDeJttMEKXpYR8X'
const TABLE_FACTURES = 'tbl3C95q9hjjIVz8W'

const CURE_TYPE_RE = /cure\s+(\d+)\s*s[ée]ances?/i

function linkedIds(field: unknown): string[] {
  return Array.isArray(field) ? (field as string[]) : []
}

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
  if (req.method !== 'GET' && req.method !== 'PATCH') {
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
      const updated = await airtableUpdate(TABLE_CLIENTES, id, parsed.fields)
      res.status(200).json({ client: mapClient(updated) })
    } catch (error) {
      if (error instanceof AirtableConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de mettre à jour la cliente dans Airtable.' })
    }
    return
  }

  try {
    const clientRecord = await airtableGetRecord(TABLE_CLIENTES, id)
    if (!clientRecord) {
      res.status(404).json({ error: 'Cliente introuvable.' })
      return
    }

    const rdvIds = linkedIds(clientRecord.fields['Historique RDV'])
    const factureIds = linkedIds(clientRecord.fields['Historique factures'])

    const [rdvRecords, factureRecords] = await Promise.all([
      airtableGetByIds(TABLE_RENDEZVOUS, rdvIds),
      airtableGetByIds(TABLE_FACTURES, factureIds),
    ])

    const prestationIds = Array.from(
      new Set(rdvRecords.flatMap((r) => linkedIds(r.fields['Prestation']))),
    )
    const prestationRecords = await airtableGetByIds(TABLE_PRESTATIONS, prestationIds)
    const prestationMap = new Map<string, AirtableRecord>(
      prestationRecords.map((p) => [p.id, p]),
    )

    const historique: HistoriqueItem[] = rdvRecords
      .map((r) => {
        const prestationId = linkedIds(r.fields['Prestation'])[0]
        const prestation = prestationId ? prestationMap.get(prestationId) : undefined
        return {
          id: r.id,
          date: (r.fields['Date'] as string) ?? null,
          statut: (r.fields['Statut'] as string) ?? '',
          prestation: (prestation?.fields['Nom de la prestation'] as string) ?? '',
          prix: (prestation?.fields['Prix'] as number) ?? null,
          notes: (r.fields['Notes du RDV'] as string) ?? '',
        }
      })
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

    const factures: FactureItem[] = factureRecords
      .map((f) => ({
        id: f.id,
        date: (f.fields['Date de facture'] as string) ?? null,
        montant: (f.fields['Montant'] as number) ?? null,
        payee: Boolean(f.fields['Payée']),
      }))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

    // Séances de cure calculées automatiquement à partir de l'historique RDV
    // (une "Prestation" de type "Cure X séances" réservée plusieurs fois),
    // plutôt que d'une table Cures maintenue à la main.
    const cureProgress = new Map<string, CureItem>()
    for (const r of rdvRecords) {
      const prestationId = linkedIds(r.fields['Prestation'])[0]
      const prestation = prestationId ? prestationMap.get(prestationId) : undefined
      const type = (prestation?.fields['Type'] as string) ?? ''
      const match = CURE_TYPE_RE.exec(type)
      if (!prestationId || !prestation || !match) continue
      const total = Number(match[1])
      if (!Number.isFinite(total) || total <= 0) continue

      const entry = cureProgress.get(prestationId) ?? {
        id: prestationId,
        nom: (prestation.fields['Nom de la prestation'] as string) ?? '',
        seancesTotales: total,
        seancesFaites: 0,
      }
      if (r.fields['Statut'] === 'Honoré') entry.seancesFaites += 1
      cureProgress.set(prestationId, entry)
    }
    const cures: CureItem[] = Array.from(cureProgress.values()).filter((c) => c.seancesFaites < c.seancesTotales)

    res.status(200).json({
      client: mapClient(clientRecord),
      historique,
      factures,
      cures,
    })
  } catch (error) {
    if (error instanceof AirtableConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de récupérer la fiche cliente depuis Airtable.' })
  }
}
