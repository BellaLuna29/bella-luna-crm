import type { VercelRequest, VercelResponse } from '@vercel/node'
import { airtableList, airtableCreate, AirtableConfigError } from './_lib/airtable.js'
import { setCorsHeaders } from './_lib/cors.js'
import { requireAuth, AuthError } from './_lib/auth.js'
import { parseDepenseInput } from './_lib/mappers.js'

const TABLE_DEPENSES = 'tblHXhydmHUKycaHd'

interface AirtableAttachment {
  url: string
  filename: string
}

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
      const records = await airtableList(TABLE_DEPENSES)
      const depenses: DepenseItem[] = records
        .map((r) => {
          const attachments = r.fields['Justificatif'] as AirtableAttachment[] | undefined
          const justificatif = attachments?.[0]
          return {
            id: r.id,
            date: (r.fields['Date'] as string) ?? null,
            categorie: (r.fields['Catégorie'] as string) ?? '',
            description: (r.fields['Description'] as string) ?? '',
            montant: (r.fields['Montant'] as number) ?? null,
            recurrente: Boolean(r.fields['Récurrente']),
            justificatifUrl: justificatif?.url ?? null,
            justificatifNom: justificatif?.filename ?? null,
          }
        })
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

      res.status(200).json({ depenses })
    } catch (error) {
      if (error instanceof AirtableConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les dépenses depuis Airtable.' })
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
    const record = await airtableCreate(TABLE_DEPENSES, parsed.fields, { typecast: true })
    res.status(201).json({ id: record.id })
  } catch (error) {
    if (error instanceof AirtableConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de créer la dépense dans Airtable.' })
  }
}
