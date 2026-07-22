import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dbList, dbCreate, dbUpdate, dbDelete, SupabaseConfigError, UUID_RE, type DbRow } from './_lib/supabase.js'
import { setCorsHeaders } from './_lib/cors.js'
import { requireAuth, AuthError } from './_lib/auth.js'
import {
  parseQuestionnaireInput,
  parsePromotionInput,
  parseAlerteInput,
  parseDismissedAlertInput,
  mapStock,
  parseStockInput,
  mapCommunicationLog,
  parseCommunicationLogInput,
  mapParametres,
  parseParametresInput,
  parsePrestationInput,
} from './_lib/mappers.js'

const TABLE_PRESTATIONS = 'prestations'
const TABLE_PROMOTIONS = 'promotions'
const TABLE_QUESTIONNAIRES = 'questionnaires'
const TABLE_ALERTES = 'alertes'
const TABLE_ALERTES_LUES = 'alertes_lues'
const TABLE_NEWSLETTER_STATUT = 'newsletter_statut'
const TABLE_STOCK = 'stock'
const TABLE_COMMUNICATIONS_LOG = 'communications_log'
const TABLE_PARAMETRES = 'parametres'

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

type ParseFn = (
  body: unknown,
  opts: { requireCore: boolean },
) => { fields: Record<string, unknown> } | { errors: string[] }

async function handleCrud(
  req: VercelRequest,
  res: VercelResponse,
  { table, parse, notFoundLabel }: { table: string; parse: ParseFn; notFoundLabel: string },
): Promise<void> {
  if (req.method === 'POST') {
    const parsed = parse(req.body, { requireCore: true })
    if ('errors' in parsed) {
      res.status(400).json({ error: parsed.errors.join(' ') })
      return
    }
    try {
      const row = await dbCreate(table, parsed.fields)
      res.status(201).json({ id: row.id })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: `Impossible de créer ${notFoundLabel} dans la base de données.` })
    }
    return
  }

  const id = req.query.id
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
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
      await dbUpdate(table, id, parsed.fields)
      res.status(200).json({ ok: true })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: `Impossible de mettre à jour ${notFoundLabel} dans la base de données.` })
    }
    return
  }

  if (req.method === 'DELETE') {
    try {
      await dbDelete(table, id)
      res.status(200).json({ ok: true })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: `Impossible de supprimer ${notFoundLabel} dans la base de données.` })
    }
    return
  }

  res.status(405).json({ error: 'Méthode non autorisée.' })
}

async function handleQuestionnaires(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const rows = await dbList(TABLE_QUESTIONNAIRES)
      const questionnaires: QuestionnaireItem[] = rows
        .map((r) => ({
          id: r.id,
          nom: (r.nom as string) ?? '',
          categorie: (r.categorie as string) ?? '',
          lien: (r.lien as string) ?? '',
          clienteIds: (r.clientes_ciblees as string[]) ?? [],
        }))
        .sort((a, b) => a.nom.localeCompare(b.nom))
      res.status(200).json({ questionnaires })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les formulaires depuis la base de données.' })
    }
    return
  }
  await handleCrud(req, res, { table: TABLE_QUESTIONNAIRES, parse: parseQuestionnaireInput, notFoundLabel: 'le formulaire' })
}

async function handlePromotions(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const rows = await dbList(TABLE_PROMOTIONS)
      const promotions: PromotionItem[] = rows
        .map((r) => ({
          id: r.id,
          nom: (r.nom as string) ?? '',
          reduction: (r.reduction as number) ?? null,
          active: Boolean(r.active),
          dateExpiration: (r.date_expiration as string) ?? null,
        }))
        .sort((a, b) => Number(b.active) - Number(a.active) || a.nom.localeCompare(b.nom))

      res.status(200).json({ promotions })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les promotions depuis la base de données.' })
    }
    return
  }
  await handleCrud(req, res, { table: TABLE_PROMOTIONS, parse: parsePromotionInput, notFoundLabel: 'le code promo' })
}

async function handleAlertes(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const rows = await dbList(TABLE_ALERTES)
      const alertes: AlerteItem[] = rows
        .map((r) => ({
          id: r.id,
          titre: (r.titre as string) ?? '',
          description: (r.description as string) ?? '',
          date: (r.date as string) ?? null,
          active: r.active !== false,
        }))
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
      res.status(200).json({ alertes })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les alertes depuis la base de données.' })
    }
    return
  }
  await handleCrud(req, res, { table: TABLE_ALERTES, parse: parseAlerteInput, notFoundLabel: "l'alerte" })
}

async function handleDismissedAlertes(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const rows = await dbList(TABLE_ALERTES_LUES)
      const dismissedAlerts: DismissedAlertItem[] = rows.map((r) => ({
        id: r.id,
        cle: (r.cle as string) ?? '',
      }))
      res.status(200).json({ dismissedAlerts })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les alertes lues depuis la base de données.' })
    }
    return
  }
  await handleCrud(req, res, {
    table: TABLE_ALERTES_LUES,
    parse: parseDismissedAlertInput,
    notFoundLabel: "l'alerte lue",
  })
}

async function handleStock(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const rows = await dbList(TABLE_STOCK)
      const stock = rows.map(mapStock).sort((a, b) => a.nom.localeCompare(b.nom))
      res.status(200).json({ stock })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer le stock depuis la base de données.' })
    }
    return
  }
  await handleCrud(req, res, { table: TABLE_STOCK, parse: parseStockInput, notFoundLabel: 'le produit' })
}

async function handleCommunicationsLog(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const rows = await dbList(TABLE_COMMUNICATIONS_LOG, { order: { column: 'date_envoi', ascending: false } })
      const communications = rows.slice(0, 50).map(mapCommunicationLog)
      res.status(200).json({ communications })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: "Impossible de récupérer l'historique des communications depuis la base de données." })
    }
    return
  }

  if (req.method === 'POST') {
    const parsed = parseCommunicationLogInput(req.body)
    if ('errors' in parsed) {
      res.status(400).json({ error: parsed.errors.join(' ') })
      return
    }
    try {
      const row = await dbCreate(TABLE_COMMUNICATIONS_LOG, parsed.fields)
      res.status(201).json({ id: row.id })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: "Impossible d'enregistrer la communication dans la base de données." })
    }
    return
  }

  res.status(405).json({ error: 'Méthode non autorisée.' })
}

async function handleParametres(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const rows = await dbList(TABLE_PARAMETRES)
      res.status(200).json({ parametres: mapParametres(rows[0] ?? null) })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les paramètres depuis la base de données.' })
    }
    return
  }

  if (req.method === 'PATCH') {
    const parsed = parseParametresInput(req.body)
    if ('errors' in parsed) {
      res.status(400).json({ error: parsed.errors.join(' ') })
      return
    }
    try {
      const rows = await dbList(TABLE_PARAMETRES)
      const existing = rows[0]
      const row: DbRow = existing
        ? await dbUpdate(TABLE_PARAMETRES, existing.id, parsed.fields)
        : await dbCreate(TABLE_PARAMETRES, { libelle: 'Studio', ...parsed.fields })
      res.status(200).json({ parametres: mapParametres(row) })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: "Impossible d'enregistrer les paramètres dans la base de données." })
    }
    return
  }

  res.status(405).json({ error: 'Méthode non autorisée.' })
}

async function handleNewsletterStatut(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const rows = await dbList(TABLE_NEWSLETTER_STATUT)
      const sorted = rows
        .map((r) => (r.dernier_envoi as string) ?? null)
        .filter((v): v is string => Boolean(v))
        .sort()
      const lastSentAt = sorted.length > 0 ? sorted[sorted.length - 1] : null
      res.status(200).json({ lastSentAt })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer le statut de la newsletter depuis la base de données.' })
    }
    return
  }

  if (req.method === 'POST') {
    try {
      const row = await dbCreate(TABLE_NEWSLETTER_STATUT, {
        libelle: 'Envoi newsletter',
        dernier_envoi: new Date().toISOString(),
      })
      res.status(201).json({ id: row.id })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: "Impossible d'enregistrer l'envoi de la newsletter dans la base de données." })
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
  if (req.query.resource === 'stock') {
    await handleStock(req, res)
    return
  }
  if (req.query.resource === 'communications-log') {
    await handleCommunicationsLog(req, res)
    return
  }
  if (req.query.resource === 'parametres') {
    await handleParametres(req, res)
    return
  }

  if (req.method === 'GET') {
    try {
      const rows = await dbList(TABLE_PRESTATIONS)
      const prestations: Prestation[] = rows
        .map((r) => ({
          id: r.id,
          nom: (r.nom as string) ?? '',
          categorie: (r.categorie as string) ?? '',
          duree: (r.duree as string) ?? '',
          prix: (r.prix as number) ?? 0,
          type: (r.type as string) ?? '',
        }))
        .sort((a, b) => a.categorie.localeCompare(b.categorie) || a.nom.localeCompare(b.nom))
      res.status(200).json({ prestations })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les prestations depuis la base de données.' })
    }
    return
  }

  await handleCrud(req, res, { table: TABLE_PRESTATIONS, parse: parsePrestationInput, notFoundLabel: 'la prestation' })
}
