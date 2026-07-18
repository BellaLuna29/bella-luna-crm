import type { VercelRequest, VercelResponse } from '@vercel/node'
import { airtableList, airtableCreate, AirtableConfigError } from './_lib/airtable.js'
import { setCorsHeaders } from './_lib/cors.js'
import { requireAuth, AuthError } from './_lib/auth.js'
import { parseAbsenceInput } from './_lib/mappers.js'

const TABLE_ABSENCES = 'tblW0nybKAtbpDBcV'

interface AbsenceItem {
  id: string
  libelle: string
  dateDebut: string | null
  dateFin: string | null
  type: string
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
      const records = await airtableList(TABLE_ABSENCES)
      const absences: AbsenceItem[] = records
        .map((r) => ({
          id: r.id,
          libelle: (r.fields['Libellé'] as string) ?? '',
          dateDebut: (r.fields['Date début'] as string) ?? null,
          dateFin: (r.fields['Date fin'] as string) ?? null,
          type: (r.fields['Type'] as string) ?? 'Vacances',
        }))
        .sort((a, b) => (a.dateDebut ?? '').localeCompare(b.dateDebut ?? ''))

      res.status(200).json({ absences })
    } catch (error) {
      if (error instanceof AirtableConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les absences depuis Airtable.' })
    }
    return
  }

  // POST — create a new absence
  const parsed = parseAbsenceInput(req.body, { requireCore: true })
  if ('errors' in parsed) {
    res.status(400).json({ error: parsed.errors.join(' ') })
    return
  }

  try {
    const record = await airtableCreate(TABLE_ABSENCES, parsed.fields, { typecast: true })
    res.status(201).json({ id: record.id })
  } catch (error) {
    if (error instanceof AirtableConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: "Impossible de créer l'absence dans Airtable." })
  }
}
