import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  airtableList,
  airtableGetByIds,
  AirtableConfigError,
  type AirtableRecord,
} from './_lib/airtable.js'
import { setCorsHeaders } from './_lib/cors.js'
import { requireAuth, AuthError } from './_lib/auth.js'

const TABLE_CURES = 'tbl2xO96EFuH4Ypfs'
const TABLE_CLIENTES = 'tblMKV5WKQ7jtwXq4'
const TABLE_PRESTATIONS = 'tblDeJttMEKXpYR8X'

function linkedIds(field: unknown): string[] {
  return Array.isArray(field) ? (field as string[]) : []
}

interface CureItem {
  id: string
  clienteId: string | null
  clienteNom: string
  prestationNom: string
  dateDebut: string | null
  seancesTotales: number
  seancesFaites: number
  seancesRestantes: number
  statutCure: string
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée.' })
    return
  }

  try {
    await requireAuth(req)
  } catch (error) {
    res.status(401).json({ error: error instanceof AuthError ? error.message : 'Authentification requise.' })
    return
  }

  try {
    const records = await airtableList(TABLE_CURES)

    const clienteIds = Array.from(new Set(records.flatMap((r) => linkedIds(r.fields['Cliente']))))
    const prestationIds = Array.from(new Set(records.flatMap((r) => linkedIds(r.fields['Prestation']))))

    const [clienteRecords, prestationRecords] = await Promise.all([
      airtableGetByIds(TABLE_CLIENTES, clienteIds),
      airtableGetByIds(TABLE_PRESTATIONS, prestationIds),
    ])
    const clienteMap = new Map<string, AirtableRecord>(clienteRecords.map((c) => [c.id, c]))
    const prestationMap = new Map<string, AirtableRecord>(prestationRecords.map((p) => [p.id, p]))

    const cures: CureItem[] = records.map((r) => {
      const clienteId = linkedIds(r.fields['Cliente'])[0] ?? null
      const prestationId = linkedIds(r.fields['Prestation'])[0] ?? null
      const cliente = clienteId ? clienteMap.get(clienteId) : undefined
      const prestation = prestationId ? prestationMap.get(prestationId) : undefined
      return {
        id: r.id,
        clienteId,
        clienteNom: (cliente?.fields['Nom complet'] as string) ?? '',
        prestationNom: (prestation?.fields['Nom de la prestation'] as string) ?? '',
        dateDebut: (r.fields['Date de début'] as string) ?? null,
        seancesTotales: (r.fields['Séances totales'] as number) ?? 0,
        seancesFaites: (r.fields['Séances faites'] as number) ?? 0,
        seancesRestantes: (r.fields['Séances restantes'] as number) ?? 0,
        statutCure: (r.fields['Statut cure'] as string) ?? '',
      }
    })

    res.status(200).json({ cures })
  } catch (error) {
    if (error instanceof AirtableConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de récupérer les cures depuis Airtable.' })
  }
}
