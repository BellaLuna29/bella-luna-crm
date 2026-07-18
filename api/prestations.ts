import type { VercelRequest, VercelResponse } from '@vercel/node'
import { airtableList, AirtableConfigError } from './_lib/airtable.js'
import { setCorsHeaders } from './_lib/cors.js'
import { requireAuth, AuthError } from './_lib/auth.js'

const TABLE_PRESTATIONS = 'tblDeJttMEKXpYR8X'

interface Prestation {
  id: string
  nom: string
  categorie: string
  duree: string
  prix: number
  type: string
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
    const records = await airtableList(TABLE_PRESTATIONS)
    const prestations: Prestation[] = records
      .map((r) => ({
        id: r.id,
        nom: (r.fields['Nom de la prestation'] as string) ?? '',
        categorie: (r.fields['Catégorie'] as string) ?? '',
        duree: (r.fields['Durée'] as string) ?? '',
        prix: (r.fields['Prix'] as number) ?? 0,
        type: (r.fields['Type'] as string) ?? '',
      }))
      .sort((a, b) => a.categorie.localeCompare(a.categorie) || a.nom.localeCompare(b.nom))
    res.status(200).json({ prestations })
  } catch (error) {
    if (error instanceof AirtableConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de récupérer les prestations depuis Airtable.' })
  }
}
