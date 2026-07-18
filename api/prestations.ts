import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  airtableList,
  airtableCreate,
  airtableUpdate,
  airtableDelete,
  AirtableConfigError,
} from './_lib/airtable.js'
import { setCorsHeaders } from './_lib/cors.js'
import { requireAuth, AuthError } from './_lib/auth.js'
import { parseQuestionnaireInput } from './_lib/mappers.js'

const TABLE_PRESTATIONS = 'tblDeJttMEKXpYR8X'
const TABLE_PROMOTIONS = 'tbldqsJCBeZwve20n'
const TABLE_QUESTIONNAIRES = 'tblhPRz9gsVHoq6mb'
const RECORD_ID_RE = /^rec[a-zA-Z0-9]{14}$/

interface Prestation {
  id: string
  nom: string
  categorie: string
  duree: string
  prix: number
  type: string
}

interface PromotionItem {
  id: string
  nom: string
  reduction: number | null
  active: boolean
}

interface QuestionnaireItem {
  id: string
  nom: string
  categorie: string
  lien: string
  clienteIds: string[]
}

function linkedIds(field: unknown): string[] {
  return Array.isArray(field) ? (field as string[]) : []
}

async function handleQuestionnaires(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const records = await airtableList(TABLE_QUESTIONNAIRES)
      const questionnaires: QuestionnaireItem[] = records
        .map((r) => ({
          id: r.id,
          nom: (r.fields['Nom'] as string) ?? '',
          categorie: (r.fields['Catégorie'] as string) ?? '',
          lien: (r.fields['Lien Google Form'] as string) ?? '',
          clienteIds: linkedIds(r.fields['Clientes ciblées']),
        }))
        .sort((a, b) => a.nom.localeCompare(b.nom))
      res.status(200).json({ questionnaires })
    } catch (error) {
      if (error instanceof AirtableConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les formulaires depuis Airtable.' })
    }
    return
  }

  if (req.method === 'POST') {
    const parsed = parseQuestionnaireInput(req.body, { requireCore: true })
    if ('errors' in parsed) {
      res.status(400).json({ error: parsed.errors.join(' ') })
      return
    }
    try {
      const record = await airtableCreate(TABLE_QUESTIONNAIRES, parsed.fields, { typecast: true })
      res.status(201).json({ id: record.id })
    } catch (error) {
      if (error instanceof AirtableConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de créer le formulaire dans Airtable.' })
    }
    return
  }

  const id = req.query.id
  if (typeof id !== 'string' || !RECORD_ID_RE.test(id)) {
    res.status(400).json({ error: 'Identifiant de formulaire invalide.' })
    return
  }

  if (req.method === 'PATCH') {
    const parsed = parseQuestionnaireInput(req.body, { requireCore: false })
    if ('errors' in parsed) {
      res.status(400).json({ error: parsed.errors.join(' ') })
      return
    }
    try {
      await airtableUpdate(TABLE_QUESTIONNAIRES, id, parsed.fields)
      res.status(200).json({ ok: true })
    } catch (error) {
      if (error instanceof AirtableConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de mettre à jour le formulaire dans Airtable.' })
    }
    return
  }

  if (req.method === 'DELETE') {
    try {
      await airtableDelete(TABLE_QUESTIONNAIRES, id)
      res.status(200).json({ ok: true })
    } catch (error) {
      if (error instanceof AirtableConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de supprimer le formulaire dans Airtable.' })
    }
    return
  }

  res.status(405).json({ error: 'Méthode non autorisée.' })
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  try {
    await requireAuth(req)
  } catch (error) {
    res.status(401).json({ error: error instanceof AuthError ? error.message : 'Authentification requise.' })
    return
  }

  if (req.query.resource === 'questionnaires') {
    await handleQuestionnaires(req, res)
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée.' })
    return
  }

  if (req.query.resource === 'promotions') {
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
