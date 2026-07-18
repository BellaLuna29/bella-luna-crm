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
const TABLE_CURES = 'tbl2xO96EFuH4Ypfs'

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
    const cureIds = linkedIds(clientRecord.fields['Cures'])

    const [rdvRecords, factureRecords, cureRecords] = await Promise.all([
      airtableGetByIds(TABLE_RENDEZVOUS, rdvIds),
      airtableGetByIds(TABLE_FACTURES, factureIds),
      airtableGetByIds(TABLE_CURES, cureIds),
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

    const cures: CureItem[] = cureRecords.map((c) => ({
      id: c.id,
      nom: (c.fields['Cure'] as string) ?? '',
      seancesTotales: (c.fields['Séances totales'] as number) ?? 0,
      seancesFaites: (c.fields['Séances faites'] as number) ?? 0,
    }))

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
