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
import { parseFactureInput } from './_lib/mappers.js'

const TABLE_FACTURES = 'tbl3C95q9hjjIVz8W'
const TABLE_CLIENTES = 'tblMKV5WKQ7jtwXq4'
const TABLE_PROMOTIONS = 'tbldqsJCBeZwve20n'

function linkedIds(field: unknown): string[] {
  return Array.isArray(field) ? (field as string[]) : []
}

interface FactureItem {
  id: string
  date: string | null
  montant: number | null
  payee: boolean
  clienteId: string | null
  clienteNom: string
  categorieFacture: string
  promoId: string | null
  promoNom: string
  promoReduction: number | null
  description: string
  notes: string
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
      const records = await airtableList(TABLE_FACTURES)

      const clienteIds = Array.from(
        new Set(records.flatMap((r) => linkedIds(r.fields['Cliente']))),
      )
      const promoIds = Array.from(
        new Set(records.flatMap((r) => linkedIds(r.fields['Promo appliquée']))),
      )
      const [clienteRecords, promoRecords] = await Promise.all([
        airtableGetByIds(TABLE_CLIENTES, clienteIds),
        airtableGetByIds(TABLE_PROMOTIONS, promoIds),
      ])
      const clienteMap = new Map<string, AirtableRecord>(clienteRecords.map((c) => [c.id, c]))
      const promoMap = new Map<string, AirtableRecord>(promoRecords.map((p) => [p.id, p]))

      const factures: FactureItem[] = records
        .map((r) => {
          const clienteId = linkedIds(r.fields['Cliente'])[0] ?? null
          const cliente = clienteId ? clienteMap.get(clienteId) : undefined
          const promoId = linkedIds(r.fields['Promo appliquée'])[0] ?? null
          const promo = promoId ? promoMap.get(promoId) : undefined
          return {
            id: r.id,
            date: (r.fields['Date de facture'] as string) ?? null,
            montant: (r.fields['Montant'] as number) ?? null,
            payee: Boolean(r.fields['Payée']),
            clienteId,
            clienteNom: (cliente?.fields['Nom complet'] as string) ?? '',
            categorieFacture: (r.fields['Catégorie de facture'] as string) ?? 'Commercial',
            promoId,
            promoNom: (promo?.fields['Nom'] as string) ?? '',
            promoReduction: (promo?.fields['Réduction'] as number) ?? null,
            description: (r.fields['Description'] as string) ?? '',
            notes: (r.fields['Notes'] as string) ?? '',
          }
        })
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

      res.status(200).json({ factures })
    } catch (error) {
      if (error instanceof AirtableConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les factures depuis Airtable.' })
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
    const record = await airtableCreate(TABLE_FACTURES, parsed.fields)
    res.status(201).json({ id: record.id })
  } catch (error) {
    if (error instanceof AirtableConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de créer la facture dans Airtable.' })
  }
}
