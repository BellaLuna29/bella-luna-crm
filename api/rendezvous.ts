import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  airtableList,
  airtableGetByIds,
  airtableCreate,
  AirtableConfigError,
  type AirtableRecord,
} from './_lib/airtable.js'
import { setCorsHeaders } from './_lib/cors.js'
import { requireAuth, AuthError } from './_lib/auth.js'
import { parseRendezVousInput } from './_lib/mappers.js'

const TABLE_RENDEZVOUS = 'tblFF89VWARwjPxus'
const TABLE_CLIENTES = 'tblMKV5WKQ7jtwXq4'
const TABLE_PRESTATIONS = 'tblDeJttMEKXpYR8X'

function linkedIds(field: unknown): string[] {
  return Array.isArray(field) ? (field as string[]) : []
}

interface RdvItem {
  id: string
  date: string | null
  statut: string
  notes: string
  clienteId: string | null
  clienteNom: string
  prestationId: string | null
  prestationNom: string
  prix: number | null
  duree: string
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
      const records = await airtableList(TABLE_RENDEZVOUS)

      const clienteIds = Array.from(
        new Set(records.flatMap((r) => linkedIds(r.fields['Cliente']))),
      )
      const prestationIds = Array.from(
        new Set(records.flatMap((r) => linkedIds(r.fields['Prestation']))),
      )

      const [clienteRecords, prestationRecords] = await Promise.all([
        airtableGetByIds(TABLE_CLIENTES, clienteIds),
        airtableGetByIds(TABLE_PRESTATIONS, prestationIds),
      ])
      const clienteMap = new Map<string, AirtableRecord>(clienteRecords.map((c) => [c.id, c]))
      const prestationMap = new Map<string, AirtableRecord>(
        prestationRecords.map((p) => [p.id, p]),
      )

      const rendezvous: RdvItem[] = records.map((r) => {
        const clienteId = linkedIds(r.fields['Cliente'])[0] ?? null
        const prestationId = linkedIds(r.fields['Prestation'])[0] ?? null
        const cliente = clienteId ? clienteMap.get(clienteId) : undefined
        const prestation = prestationId ? prestationMap.get(prestationId) : undefined
        return {
          id: r.id,
          date: (r.fields['Date'] as string) ?? null,
          statut: (r.fields['Statut'] as string) ?? '',
          notes: (r.fields['Notes du RDV'] as string) ?? '',
          clienteId,
          clienteNom: (cliente?.fields['Nom complet'] as string) ?? '',
          prestationId,
          prestationNom: (prestation?.fields['Nom de la prestation'] as string) ?? '',
          prix: (prestation?.fields['Prix'] as number) ?? null,
          duree: (prestation?.fields['Durée'] as string) ?? '',
        }
      })

      res.status(200).json({ rendezvous })
    } catch (error) {
      if (error instanceof AirtableConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les rendez-vous depuis Airtable.' })
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
    const record = await airtableCreate(TABLE_RENDEZVOUS, parsed.fields)
    res.status(201).json({ id: record.id })
  } catch (error) {
    if (error instanceof AirtableConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de créer le rendez-vous dans Airtable.' })
  }
}
