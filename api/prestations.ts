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
import {
  parseQuestionnaireInput,
  parsePromotionInput,
  parseAlerteInput,
  parseDismissedAlertInput,
} from './_lib/mappers.js'

const TABLE_PRESTATIONS = 'tblDeJttMEKXpYR8X'
const TABLE_PROMOTIONS = 'tbldqsJCBeZwve20n'
const TABLE_QUESTIONNAIRES = 'tblhPRz9gsVHoq6mb'
const TABLE_ALERTES = 'tblk5PC1ALEQpHovg'
const TABLE_ALERTES_LUES = 'tblqKRi9GGYhxdXM3'
const TABLE_NEWSLETTER_STATUT = 'tblHtw5e4no105cyq'
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
  dateExpiration: string | null
}

interface QuestionnaireItem {
  id: string
  nom: string
  categorie: string
  lien: string
  clienteIds: string[]
}

interface AlerteItem {
  id: string
  titre: string
  description: string
  date: string | null
  active: boolean
}

interface DismissedAlertItem {
  id: string
  cle: string
}

function linkedIds(field: unknown): string[] {
  return Array.isArray(field) ? (field as string[]) : []
}

type ParseFn = (
  body: unknown,
  opts: { requireCore: boolean },
) => { fields: Record<string, unknown> } | { errors: string[] }

async function handleCrud(
  req: VercelRequest,
  res: VercelResponse,
  {
    tableId,
    parse,
    notFoundLabel,
  }: { tableId: string; parse: ParseFn; notFoundLabel: string },
): Promise<void> {
  if (req.method === 'POST') {
    const parsed = parse(req.body, { requireCore: true })
    if ('errors' in parsed) {
      res.status(400).json({ error: parsed.errors.join(' ') })
      return
    }
    try {
      const record = await airtableCreate(tableId, parsed.fields, { typecast: true })
      res.status(201).json({ id: record.id })
    } catch (error) {
      if (error instanceof AirtableConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: `Impossible de créer ${notFoundLabel} dans Airtable.` })
    }
    return
  }

  const id = req.query.id
  if (typeof id !== 'string' || !RECORD_ID_RE.test(id)) {
    res.status(400).json({ error: 'Identifiant invalide.' })
    return
  }

  if (req.method === 'PATCH') {
    const parsed = parse(req.body, { requireCore: false })
    if ('errors' in parsed) {
      res.status(400).json({ error: parsed.errors.join(' ') })
      return
    }
    try {
      await airtableUpdate(tableId, id, parsed.fields, { typecast: true })
      res.status(200).json({ ok: true })
    } catch (error) {
      if (error instanceof AirtableConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: `Impossible de mettre à jour ${notFoundLabel} dans Airtable.` })
    }
    return
  }

  if (req.method === 'DELETE') {
    try {
      await airtableDelete(tableId, id)
      res.status(200).json({ ok: true })
    } catch (error) {
      if (error instanceof AirtableConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: `Impossible de supprimer ${notFoundLabel} dans Airtable.` })
    }
    return
  }

  res.status(405).json({ error: 'Méthode non autorisée.' })
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
  await handleCrud(req, res, { tableId: TABLE_QUESTIONNAIRES, parse: parseQuestionnaireInput, notFoundLabel: 'le formulaire' })
}

async function handlePromotions(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const records = await airtableList(TABLE_PROMOTIONS)
      const promotions: PromotionItem[] = records
        .map((r) => ({
          id: r.id,
          nom: (r.fields['Nom'] as string) ?? '',
          reduction: (r.fields['Réduction'] as number) ?? null,
          active: Boolean(r.fields['Active']),
          dateExpiration: (r.fields["Date d'expiration"] as string) ?? null,
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
  await handleCrud(req, res, { tableId: TABLE_PROMOTIONS, parse: parsePromotionInput, notFoundLabel: 'le code promo' })
}

async function handleAlertes(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const records = await airtableList(TABLE_ALERTES)
      const alertes: AlerteItem[] = records
        .map((r) => ({
          id: r.id,
          titre: (r.fields['Titre'] as string) ?? '',
          description: (r.fields['Description'] as string) ?? '',
          date: (r.fields['Date'] as string) ?? null,
          active: r.fields['Active'] !== false,
        }))
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
      res.status(200).json({ alertes })
    } catch (error) {
      if (error instanceof AirtableConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les alertes depuis Airtable.' })
    }
    return
  }
  await handleCrud(req, res, { tableId: TABLE_ALERTES, parse: parseAlerteInput, notFoundLabel: "l'alerte" })
}

async function handleDismissedAlertes(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const records = await airtableList(TABLE_ALERTES_LUES)
      const dismissedAlerts: DismissedAlertItem[] = records.map((r) => ({
        id: r.id,
        cle: (r.fields['Clé'] as string) ?? '',
      }))
      res.status(200).json({ dismissedAlerts })
    } catch (error) {
      if (error instanceof AirtableConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les alertes lues depuis Airtable.' })
    }
    return
  }
  await handleCrud(req, res, {
    tableId: TABLE_ALERTES_LUES,
    parse: parseDismissedAlertInput,
    notFoundLabel: "l'alerte lue",
  })
}

async function handleNewsletterStatut(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const records = await airtableList(TABLE_NEWSLETTER_STATUT)
      const lastSentAt = records
        .map((r) => (r.fields['Dernier envoi'] as string) ?? null)
        .filter((v): v is string => Boolean(v))
        .sort()
        .at(-1) ?? null
      res.status(200).json({ lastSentAt })
    } catch (error) {
      if (error instanceof AirtableConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: "Impossible de récupérer le statut de la newsletter depuis Airtable." })
    }
    return
  }

  if (req.method === 'POST') {
    try {
      const record = await airtableCreate(
        TABLE_NEWSLETTER_STATUT,
        { Libellé: 'Envoi newsletter', 'Dernier envoi': new Date().toISOString() },
        { typecast: true },
      )
      res.status(201).json({ id: record.id })
    } catch (error) {
      if (error instanceof AirtableConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: "Impossible d'enregistrer l'envoi de la newsletter dans Airtable." })
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
  if (req.query.resource === 'promotions') {
    await handlePromotions(req, res)
    return
  }
  if (req.query.resource === 'alertes') {
    await handleAlertes(req, res)
    return
  }
  if (req.query.resource === 'dismissed-alerts') {
    await handleDismissedAlertes(req, res)
    return
  }
  if (req.query.resource === 'newsletter-status') {
    await handleNewsletterStatut(req, res)
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée.' })
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
      .sort((a, b) => a.categorie.localeCompare(b.categorie) || a.nom.localeCompare(b.nom))
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
