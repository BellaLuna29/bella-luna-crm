import type { VercelRequest, VercelResponse } from '@vercel/node'
import { airtableList, airtableCreate, airtableDelete, AirtableConfigError } from './_lib/airtable.js'
import { setCorsHeaders } from './_lib/cors.js'
import { requireAuth, AuthError } from './_lib/auth.js'
import { parseAbsenceInput } from './_lib/mappers.js'

const TABLE_ABSENCES = 'tblW0nybKAtbpDBcV'
const RECORD_ID_RE = /^rec[a-zA-Z0-9]{14}$/

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
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'DELETE') {
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

  if (req.method === 'DELETE') {
    const id = req.query.id
    if (typeof id !== 'string' || !RECORD_ID_RE.test(id)) {
      res.status(400).json({ error: 'Identifiant invalide.' })
      return
    }
    try {
      await airtableDelete(TABLE_ABSENCES, id)
      res.status(200).json({ ok: true })
    } catch (error) {
      if (error instanceof AirtableConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: "Impossible de supprimer l'absence dans Airtable." })
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
