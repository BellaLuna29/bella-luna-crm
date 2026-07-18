import type { VercelRequest, VercelResponse } from '@vercel/node'
import { airtableList, AirtableConfigError } from './_lib/airtable.js'
import { setCorsHeaders } from './_lib/cors.js'
import { requireAuth, AuthError } from './_lib/auth.js'

const TABLE_PROMOTIONS = 'tbldqsJCBeZwve20n'

interface PromotionItem {
  id: string
  nom: string
  reduction: number | null
  active: boolean
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
    const records = await airtableList(TABLE_PROMOTIONS)
    const promotions: PromotionItem[] = records
      .map((r) => ({
        id: r.id,
        nom: (r.fields['Nom'] as string) ?? '',
        reduction: (r.fields['Réduction'] as number) ?? null,
        active: Boolean(r.fields['Active']),
      }))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.nom.localeCompare(b.nom))

    res.status(200).json({ promotions })
  } catch (error) {
    if (error instanceof AirtableConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de récupérer les promotions depuis Airtable.' })
  }
}
