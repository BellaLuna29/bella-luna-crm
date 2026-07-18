import type { VercelRequest, VercelResponse } from '@vercel/node'
import { airtableList, AirtableConfigError } from './_lib/airtable.js'
import { setCorsHeaders } from './_lib/cors.js'
import { requireAuth, AuthError } from './_lib/auth.js'

const TABLE_DEPENSES = 'tblHXhydmHUKycaHd'

interface DepenseItem {
  id: string
  date: string | null
  categorie: string
  description: string
  montant: number | null
  recurrente: boolean
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
    const records = await airtableList(TABLE_DEPENSES)
    const depenses: DepenseItem[] = records
      .map((r) => ({
        id: r.id,
        date: (r.fields['Date'] as string) ?? null,
        categorie: (r.fields['Catégorie'] as string) ?? '',
        description: (r.fields['Description'] as string) ?? '',
        montant: (r.fields['Montant'] as number) ?? null,
        recurrente: Boolean(r.fields['Récurrente']),
      }))
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
}
