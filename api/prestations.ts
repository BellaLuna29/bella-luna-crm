import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomBytes } from 'node:crypto'
import {
  dbList,
  dbCreate,
  dbUpdate,
  dbDelete,
  dbGet,
  dbGetByIds,
  SupabaseConfigError,
  UUID_RE,
  type DbRow,
} from './_lib/supabase.js'
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
  parseDisponibiliteInput,
  parseSmsTemplateInput,
  parseEmailTemplateInput,
} from './_lib/mappers.js'
import { buildNewsletterHtml, buildTransactionalHtml, sendNewsletterBatch, EmailConfigError } from './_lib/email.js'
import { renderTemplate, type TemplateContext } from './_lib/templateEngine.js'
import { formatDateHeureNaturel } from './_lib/formatDate.js'
import { cureTotalSeances, cureCyclePosition } from './_lib/cure.js'
import { parseDureeMinutes } from './_lib/duree.js'
import { parisHeureMinute } from './_lib/timezone.js'

const TABLE_PRESTATIONS = 'prestations'
const TABLE_PROMOTIONS = 'promotions'
const TABLE_QUESTIONNAIRES = 'questionnaires'
const TABLE_ALERTES = 'alertes'
const TABLE_ALERTES_LUES = 'alertes_lues'
const TABLE_NEWSLETTER_STATUT = 'newsletter_statut'
const TABLE_STOCK = 'stock'
const TABLE_COMMUNICATIONS_LOG = 'communications_log'
const TABLE_PARAMETRES = 'parametres'
const TABLE_CLIENTS = 'clients'
const TABLE_RENDEZVOUS = 'rendezvous'
const TABLE_FACTURES = 'factures'
const TABLE_SMS_TEMPLATES = 'sms_templates'
const TABLE_EMAIL_TEMPLATES = 'email_templates'
const TABLE_DEPENSES = 'depenses'
const TABLE_ABSENCES = 'absences'
const TABLE_DISPONIBILITES = 'disponibilites'
const SITE_URL = process.env.ALLOWED_ORIGIN || 'https://bella-luna-crm-bella-luna.vercel.app'

interface Prestation {
  id: string
  nom: string
  categorie: string
  duree: string
  prix: number
  type: string
  couleur: string | null
}

interface PromotionItem {
  id: string
  nom: string
  reduction: number | null
  reductionMontant: number | null
  typeReduction: string
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

interface SmsTemplateItem {
  id: string
  cle: string
  libelle: string
  corps: string
}

interface EmailTemplateItem {
  id: string
  cle: string
  libelle: string
  objet: string
  corps: string
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

async function handleSmsTemplates(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const rows = await dbList(TABLE_SMS_TEMPLATES)
      const templates: SmsTemplateItem[] = rows
        .map((r) => ({
          id: r.id,
          cle: (r.cle as string) ?? '',
          libelle: (r.libelle as string) ?? '',
          corps: (r.corps as string) ?? '',
        }))
        .sort((a, b) => a.libelle.localeCompare(b.libelle))
      res.status(200).json({ templates })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les modèles SMS depuis la base de données.' })
    }
    return
  }
  await handleCrud(req, res, { table: TABLE_SMS_TEMPLATES, parse: parseSmsTemplateInput, notFoundLabel: 'le modèle SMS' })
}

async function handleEmailTemplates(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const rows = await dbList(TABLE_EMAIL_TEMPLATES)
      const templates: EmailTemplateItem[] = rows
        .map((r) => ({
          id: r.id,
          cle: (r.cle as string) ?? '',
          libelle: (r.libelle as string) ?? '',
          objet: (r.objet as string) ?? '',
          corps: (r.corps as string) ?? '',
        }))
        .sort((a, b) => a.libelle.localeCompare(b.libelle))
      res.status(200).json({ templates })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les modèles e-mail depuis la base de données.' })
    }
    return
  }
  await handleCrud(req, res, { table: TABLE_EMAIL_TEMPLATES, parse: parseEmailTemplateInput, notFoundLabel: 'le modèle e-mail' })
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
          reductionMontant: (r.reduction_montant as number) ?? null,
          typeReduction: (r.type_reduction as string) || 'pourcentage',
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

interface DisponibiliteItem {
  id: string
  jourSemaine: number
  actif: boolean
  heureDebut: string
  heureFin: string
}

function mapDisponibilite(r: DbRow): DisponibiliteItem {
  return {
    id: r.id,
    jourSemaine: r.jour_semaine as number,
    actif: Boolean(r.actif),
    heureDebut: (r.heure_debut as string) ?? '09:00',
    heureFin: (r.heure_fin as string) ?? '18:00',
  }
}

/**
 * Weekly availability template (which days/hours she generally works) —
 * groundwork for a future online-booking page. Not consumed by anything
 * public yet; just the data model + admin UI to define it.
 */
async function handleDisponibilites(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const rows = await dbList(TABLE_DISPONIBILITES, { order: { column: 'jour_semaine' } })
      res.status(200).json({ disponibilites: rows.map(mapDisponibilite) })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer les disponibilités depuis la base de données.' })
    }
    return
  }

  if (req.method === 'PATCH') {
    const jourRaw = req.query.jour
    const jour = typeof jourRaw === 'string' ? Number(jourRaw) : NaN
    if (!Number.isInteger(jour) || jour < 0 || jour > 6) {
      res.status(400).json({ error: 'Jour de la semaine invalide.' })
      return
    }
    const parsed = parseDisponibiliteInput(req.body)
    if ('errors' in parsed) {
      res.status(400).json({ error: parsed.errors.join(' ') })
      return
    }
    try {
      const rows = await dbList(TABLE_DISPONIBILITES, { eq: ['jour_semaine', jour] })
      const existing = rows[0]
      if (!existing) {
        res.status(404).json({ error: 'Jour introuvable.' })
        return
      }
      const row = await dbUpdate(TABLE_DISPONIBILITES, existing.id, parsed.fields)
      res.status(200).json({ disponibilite: mapDisponibilite(row) })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: "Impossible de mettre à jour la disponibilité dans la base de données." })
    }
    return
  }

  res.status(405).json({ error: 'Méthode non autorisée.' })
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

async function handleNewsletterSend(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée.' })
    return
  }

  const body = req.body as { subject?: unknown; body?: unknown; clientIds?: unknown }
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const bodyText = typeof body.body === 'string' ? body.body.trim() : ''
  const clientIds = Array.isArray(body.clientIds)
    ? body.clientIds.filter((id): id is string => typeof id === 'string' && UUID_RE.test(id))
    : []

  if (!subject) {
    res.status(400).json({ error: 'Le sujet est obligatoire.' })
    return
  }
  if (!bodyText) {
    res.status(400).json({ error: 'Le message est obligatoire.' })
    return
  }
  if (clientIds.length === 0) {
    res.status(400).json({ error: 'Aucune destinataire sélectionnée.' })
    return
  }
  if (clientIds.length > 100) {
    res.status(400).json({ error: '100 destinataires maximum par envoi (limite du plan gratuit Resend).' })
    return
  }

  try {
    const clients = await dbGetByIds(TABLE_CLIENTS, clientIds)
    const recipients = clients.filter((c) => typeof c.email === 'string' && c.email.length > 0)

    if (recipients.length === 0) {
      res.status(400).json({ error: "Aucune des destinataires sélectionnées n'a d'adresse e-mail." })
      return
    }

    const items = recipients.map((c) => ({
      to: c.email as string,
      subject,
      html: buildNewsletterHtml({
        bodyText,
        unsubscribeUrl: `${SITE_URL}/api/prestations?resource=newsletter-unsubscribe&id=${c.id}`,
      }),
    }))

    const result = await sendNewsletterBatch(items)
    res.status(200).json({
      sent: result.sent,
      failed: recipients.length - result.sent,
      error: result.errorMessage,
    })
  } catch (error) {
    if (error instanceof EmailConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: "Impossible d'envoyer la newsletter." })
  }
}

function unsubscribePage(title: string, message: string): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} — Bella Luna</title>
  </head>
  <body style="margin:0;padding:0;background:#F4F8F6;font-family:Georgia,'Times New Roman',serif;color:#23332D;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="min-height:100vh;">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table role="presentation" width="100%" style="max-width:420px;background:#fff;border-radius:16px;border:1px solid #DCE7E1;overflow:hidden;">
            <tr>
              <td style="background:#3A5A50;padding:24px;text-align:center;">
                <div style="color:#fff;font-size:18px;font-weight:600;letter-spacing:0.04em;">Bella Luna</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;text-align:center;">
                <h1 style="font-size:18px;margin:0 0 12px;">${title}</h1>
                <p style="font-size:14px;color:#6B8074;line-height:1.6;margin:0;">${message}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

// Public — no auth: recipients click this from an email, they aren't signed into the CRM.
async function handleNewsletterUnsubscribe(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')

  const id = req.query.id
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    res.status(400).send(unsubscribePage('Lien invalide', "Ce lien de désinscription n'est pas valide."))
    return
  }

  try {
    const client = await dbGet(TABLE_CLIENTS, id)
    if (!client) {
      res.status(404).send(unsubscribePage('Introuvable', "Nous n'avons pas trouvé votre fiche cliente."))
      return
    }
    await dbUpdate(TABLE_CLIENTS, id, { newsletter_ok: false })
    const nom = typeof client.nom_complet === 'string' && client.nom_complet ? client.nom_complet : null
    res.status(200).send(
      unsubscribePage(
        'Désinscription confirmée',
        `${nom ? `${nom}, vous` : 'Vous'} ne recevrez plus la newsletter de Bella Luna. À très bientôt !`,
      ),
    )
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      res.status(500).send(unsubscribePage('Erreur', error.message))
      return
    }
    console.error(error)
    res.status(502).send(unsubscribePage('Erreur', 'Une erreur est survenue, réessaie plus tard.'))
  }
}

const CRENEAU_PAS_MINUTES = 30
const RESERVATION_MAX_JOURS = 60
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/
const HEURE_ONLY_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function generateReservationToken(): string {
  return randomBytes(9).toString('base64url')
}

/** Reads (or creates, on first call) the secret slug gating the public /reserver link. */
async function ensureReservationToken(regenerate: boolean): Promise<string> {
  const rows = await dbList(TABLE_PARAMETRES)
  const existing = rows[0]
  const current = existing?.lien_reservation_token as string | undefined
  if (current && !regenerate) return current
  const token = generateReservationToken()
  if (existing) {
    await dbUpdate(TABLE_PARAMETRES, existing.id, { lien_reservation_token: token })
  } else {
    await dbCreate(TABLE_PARAMETRES, { libelle: 'Studio', lien_reservation_token: token })
  }
  return token
}

/** Public endpoints are gated by this token instead of a fixed, guessable path — she can rotate it any time to cut off an old/leaked link. */
async function isValidReservationToken(token: unknown): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0) return false
  const rows = await dbList(TABLE_PARAMETRES)
  const stored = rows[0]?.lien_reservation_token as string | undefined
  return Boolean(stored) && stored === token
}

async function handleReservationToken(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      res.status(200).json({ token: await ensureReservationToken(false) })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de récupérer le lien de réservation.' })
    }
    return
  }
  if (req.method === 'POST') {
    try {
      res.status(200).json({ token: await ensureReservationToken(true) })
    } catch (error) {
      if (error instanceof SupabaseConfigError) {
        res.status(500).json({ error: error.message })
        return
      }
      console.error(error)
      res.status(502).json({ error: 'Impossible de régénérer le lien de réservation.' })
    }
    return
  }
  res.status(405).json({ error: 'Méthode non autorisée.' })
}

function minutesFromMidnight(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function hhmmFromMinutes(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Converts a "this is what the clock reads in Paris" date+time into the
 * correct UTC instant, regardless of the server's own timezone (Vercel runs
 * in UTC). Guesses UTC first, reads what that instant looks like in Paris,
 * then corrects by the drift — works across the CET/CEST switch since the
 * drift is computed for the actual date, not a hardcoded offset.
 */
function parisWallClockToUtcIso(dateStr: string, heureStr: string): string {
  const guessUtc = new Date(`${dateStr}T${heureStr}:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(guessUtc)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0'
  const readAsUtcMs = Date.UTC(
    Number(get('year')),
    Number(get('month')) - 1,
    Number(get('day')),
    Number(get('hour')) % 24,
    Number(get('minute')),
  )
  const desiredAsUtcMs = Date.UTC(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(5, 7)) - 1,
    Number(dateStr.slice(8, 10)),
    Number(heureStr.slice(0, 2)),
    Number(heureStr.slice(3, 5)),
  )
  const driftMs = desiredAsUtcMs - readAsUtcMs
  return new Date(guessUtc.getTime() + driftMs).toISOString()
}

type RaisonIndisponible = 'jour_inactif' | 'absence' | 'complet'

interface CreneauxResult {
  creneaux: string[]
  raison: RaisonIndisponible | null
}

/**
 * Computes free start times (HH:MM, every 30min) for a given calendar date
 * and prestation duration, from the weekly disponibilites template minus
 * absences minus existing rendez-vous (any non-Annulé statut, including
 * "En attente" — two people must never both "grab" the same open slot).
 * Also reports WHY there's nothing, so the public page can say something
 * more useful than a blank list (not a working day vs. absente vs. complet).
 */
function nextDateStr(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function computeCreneauxPourDate(dateStr: string, dureeMin: number): Promise<CreneauxResult> {
  const dow = new Date(`${dateStr}T12:00:00`).getDay()
  // Widen the UTC range by a day on each side of the Paris calendar day so a
  // CET/CEST offset can never push a real occupation just outside the window.
  const rangeStart = parisWallClockToUtcIso(dateStr, '00:00')
  const rangeEnd = parisWallClockToUtcIso(nextDateStr(dateStr), '00:00')

  const [dispoRows, absenceRows, rdvRows] = await Promise.all([
    dbList(TABLE_DISPONIBILITES, { eq: ['jour_semaine', dow] }),
    dbList(TABLE_ABSENCES),
    dbList(TABLE_RENDEZVOUS, {
      select: '*, prestation:prestations(duree)',
      gte: ['date', rangeStart],
      lt: ['date', rangeEnd],
    }),
  ])

  const dispo = dispoRows[0]
  if (!dispo || !dispo.actif) return { creneaux: [], raison: 'jour_inactif' }

  let fenetreDebut = minutesFromMidnight((dispo.heure_debut as string) ?? '09:00')
  let fenetreFin = minutesFromMidnight((dispo.heure_fin as string) ?? '18:00')

  const MIDI = 13 * 60
  for (const a of absenceRows) {
    const debut = a.date_debut as string | null
    const fin = a.date_fin as string | null
    if (!debut || !fin || dateStr < debut || dateStr > fin) continue
    const demi = a.demi_journee as string | null
    if (!demi) return { creneaux: [], raison: 'absence' }
    if (demi === 'matin') fenetreDebut = Math.max(fenetreDebut, MIDI)
    else if (demi === 'apres-midi') fenetreFin = Math.min(fenetreFin, MIDI)
  }
  if (fenetreDebut >= fenetreFin) return { creneaux: [], raison: 'absence' }

  const occupations: { debut: number; fin: number }[] = []
  for (const r of rdvRows) {
    const rDateStr = r.date as string | null
    if (!rDateStr || r.statut === 'Annulé') continue
    const start = new Date(rDateStr)
    if (Number.isNaN(start.getTime())) continue
    const { heure, minute } = parisHeureMinute(start)
    const startDateStr = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(start)
    if (startDateStr !== dateStr) continue
    const prestation = r.prestation as { duree?: string } | null
    const dur =
      parseDureeMinutes(prestation?.duree ?? '') +
      (typeof r.minutes_supplementaires === 'number' ? r.minutes_supplementaires : 0)
    const startMin = heure * 60 + minute
    occupations.push({ debut: startMin, fin: startMin + dur })
  }

  const creneaux: string[] = []
  for (let t = fenetreDebut; t + dureeMin <= fenetreFin; t += CRENEAU_PAS_MINUTES) {
    const chevauche = occupations.some((o) => t < o.fin && t + dureeMin > o.debut)
    if (!chevauche) creneaux.push(hhmmFromMinutes(t))
  }
  return { creneaux, raison: creneaux.length === 0 ? 'complet' : null }
}

interface PublicPrestationItem {
  id: string
  nom: string
  categorie: string
  prix: number
  duree: string
}

/** Public — only "séance unique" prestations with a real durée are bookable online. */
async function handlePublicPrestations(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée.' })
    return
  }
  if (!(await isValidReservationToken(req.query.token))) {
    res.status(404).json({ error: 'Page introuvable.' })
    return
  }
  try {
    const rows = await dbList(TABLE_PRESTATIONS)
    const prestations: PublicPrestationItem[] = rows
      .filter((r) => {
        const duree = (r.duree as string) ?? ''
        if (!duree.trim()) return false
        return !cureTotalSeances((r.type as string) ?? '')
      })
      .map((r) => ({
        id: r.id,
        nom: (r.nom as string) ?? '',
        categorie: (r.categorie as string) ?? '',
        prix: (r.prix as number) ?? 0,
        duree: (r.duree as string) ?? '',
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
}

/** Public — available créneaux for a date + prestation. */
async function handlePublicDisponibilites(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée.' })
    return
  }
  if (!(await isValidReservationToken(req.query.token))) {
    res.status(404).json({ error: 'Page introuvable.' })
    return
  }
  const dateStr = req.query.date
  const prestationId = req.query.prestationId
  if (typeof dateStr !== 'string' || !DATE_ONLY_RE.test(dateStr) || typeof prestationId !== 'string' || !UUID_RE.test(prestationId)) {
    res.status(400).json({ error: 'Date ou prestation invalide.' })
    return
  }
  const todayStr = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date())
  const maxDate = new Date()
  maxDate.setDate(maxDate.getDate() + RESERVATION_MAX_JOURS)
  const maxDateStr = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(maxDate)
  if (dateStr < todayStr || dateStr > maxDateStr) {
    res.status(200).json({ creneaux: [], raison: 'jour_inactif' })
    return
  }

  try {
    const prestation = await dbGet(TABLE_PRESTATIONS, prestationId)
    const duree = (prestation?.duree as string) ?? ''
    if (!prestation || !duree.trim() || cureTotalSeances((prestation.type as string) ?? '')) {
      res.status(404).json({ error: 'Prestation introuvable.' })
      return
    }
    const dureeMin = parseDureeMinutes(duree)
    const result = await computeCreneauxPourDate(dateStr, dureeMin)
    res.status(200).json(result)
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de calculer les disponibilités.' })
  }
}

/** Public — creates a "En attente" rendez-vous request. Never touches an existing cliente record. */
async function handlePublicBooking(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée.' })
    return
  }
  const b = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>

  if (!(await isValidReservationToken(b.token))) {
    res.status(404).json({ error: 'Page introuvable.' })
    return
  }

  // Honeypot: real visitors never fill this hidden field. Pretend success
  // without writing anything, so bots don't learn it was rejected.
  if (typeof b.site === 'string' && b.site.trim().length > 0) {
    res.status(201).json({ ok: true })
    return
  }

  const dateStr = typeof b.date === 'string' ? b.date : ''
  const heureStr = typeof b.heure === 'string' ? b.heure : ''
  const prestationId = typeof b.prestationId === 'string' ? b.prestationId : ''
  const nom = typeof b.nom === 'string' ? b.nom.trim() : ''
  const telephone = typeof b.telephone === 'string' ? b.telephone.trim() : ''
  const email = typeof b.email === 'string' ? b.email.trim() : ''

  if (!DATE_ONLY_RE.test(dateStr) || !HEURE_ONLY_RE.test(heureStr) || !UUID_RE.test(prestationId)) {
    res.status(400).json({ error: 'Créneau invalide.' })
    return
  }
  if (!nom || nom.length > 200) {
    res.status(400).json({ error: 'Le nom est obligatoire (200 caractères max).' })
    return
  }
  if (!telephone && !email) {
    res.status(400).json({ error: 'Indique un téléphone ou un e-mail pour être recontactée.' })
    return
  }

  try {
    const prestation = await dbGet(TABLE_PRESTATIONS, prestationId)
    const dureeStr = (prestation?.duree as string) ?? ''
    if (!prestation || !dureeStr.trim() || cureTotalSeances((prestation.type as string) ?? '')) {
      res.status(404).json({ error: 'Prestation introuvable.' })
      return
    }
    const dureeMin = parseDureeMinutes(dureeStr)

    // Re-check server-side — never trust the slot the client says is free.
    const { creneaux } = await computeCreneauxPourDate(dateStr, dureeMin)
    if (!creneaux.includes(heureStr)) {
      res.status(409).json({ error: "Ce créneau n'est plus disponible. Choisis-en un autre." })
      return
    }

    const trueIso = parisWallClockToUtcIso(dateStr, heureStr)

    const notesParts = [`Réservation en ligne — ${nom}`]
    if (telephone) notesParts.push(`Tél : ${telephone}`)
    if (email) notesParts.push(`E-mail : ${email}`)

    await dbCreate(TABLE_RENDEZVOUS, {
      cliente_id: null,
      prestation_id: prestationId,
      date: trueIso,
      statut: 'En attente',
      notes: notesParts.join(' — '),
    })

    res.status(201).json({ ok: true })
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: "Impossible d'enregistrer la demande." })
  }
}

/**
 * Full data export (raw DB rows, as-is) for the practitioner to download as
 * a backup — peace of mind independent of the Supabase/Vercel hosting.
 */
async function handleBackupExport(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée.' })
    return
  }
  try {
    const [
      clients,
      rendezvous,
      factures,
      prestations,
      promotions,
      absences,
      depenses,
      stock,
      questionnaires,
      smsTemplates,
      emailTemplates,
      parametres,
    ] = await Promise.all([
      dbList(TABLE_CLIENTS),
      dbList(TABLE_RENDEZVOUS),
      dbList(TABLE_FACTURES),
      dbList(TABLE_PRESTATIONS),
      dbList(TABLE_PROMOTIONS),
      dbList(TABLE_ABSENCES),
      dbList(TABLE_DEPENSES),
      dbList(TABLE_STOCK),
      dbList(TABLE_QUESTIONNAIRES),
      dbList(TABLE_SMS_TEMPLATES),
      dbList(TABLE_EMAIL_TEMPLATES),
      dbList(TABLE_PARAMETRES),
    ])
    const dateStr = new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="bella-luna-export-${dateStr}.json"`)
    res.status(200).json({
      exporteLe: new Date().toISOString(),
      clients,
      rendezvous,
      factures,
      prestations,
      promotions,
      absences,
      depenses,
      stock,
      questionnaires,
      smsTemplates,
      emailTemplates,
      parametres,
    })
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: "Impossible de générer l'export depuis la base de données." })
  }
}

/**
 * Safety net alongside the automatic "Honoré → facture" hook in
 * api/rendezvous/[id].ts — scans every honoré rendezvous without a linked
 * facture yet and creates one. Useful if the hook was ever bypassed (e.g. a
 * bulk update) or for RDVs that were already honoré before this feature shipped.
 *
 * Same cure/passeport rule as the hook: only the 1st session of each cycle
 * is invoiced. Cycle positions are recomputed from the full chronological
 * history per cliente+prestation (not just the un-invoiced ones), so this
 * stays correct regardless of which sessions already have a facture.
 */
async function handleSyncFacturesHonorees(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée.' })
    return
  }
  try {
    const [rdvRows, factureRows, prestationRows] = await Promise.all([
      dbList(TABLE_RENDEZVOUS, { eq: ['statut', 'Honoré'] }),
      dbList(TABLE_FACTURES),
      dbList(TABLE_PRESTATIONS),
    ])
    const invoicedRdvIds = new Set(factureRows.map((f) => f.rendezvous_id as string | null).filter(Boolean))
    const prestationById = new Map(prestationRows.map((p) => [p.id, p]))

    const byPair = new Map<string, DbRow[]>()
    for (const r of rdvRows) {
      const key = `${r.cliente_id ?? ''}__${r.prestation_id ?? ''}`
      const list = byPair.get(key) ?? []
      list.push(r)
      byPair.set(key, list)
    }
    for (const list of byPair.values()) {
      list.sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
    }

    let created = 0
    for (const [key, list] of byPair) {
      const prestationId = key.split('__')[1]
      const prestation = prestationId ? prestationById.get(prestationId) : undefined
      const total = prestation ? cureTotalSeances((prestation.type as string) ?? '') : null

      for (let i = 0; i < list.length; i++) {
        const r = list[i]
        if (invoicedRdvIds.has(r.id)) continue
        if (total && cureCyclePosition(i, total) > 1) continue

        const dateStr = typeof r.date === 'string' ? r.date.slice(0, 10) : new Date().toISOString().slice(0, 10)
        await dbCreate(TABLE_FACTURES, {
          cliente_id: r.cliente_id ?? null,
          rendezvous_id: r.id,
          montant: (prestation?.prix as number) ?? 0,
          date_facture: dateStr,
          payee: false,
          categorie_facture: 'Commercial',
          description: (prestation?.nom as string) ?? '',
        })
        created += 1
      }
    }
    res.status(200).json({ created })
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: 'Impossible de générer les factures manquantes.' })
  }
}

const HOUR_MS = 60 * 60 * 1000

/**
 * Triggered daily by Vercel Cron. No-ops unless "Rappels automatiques" is
 * turned on in Paramètres (off by default). When active, sends the same
 * "Rappel nouveau client" (72h, no history) / "Rappel client" (48h, has
 * history) reminders that SmsView surfaces for manual sending — but by
 * e-mail only, automatically, once per rendez-vous (tracked via
 * rappel_auto_envoye_le so a rendez-vous is never reminded twice).
 * Public — Vercel Cron doesn't carry a Clerk session — but inert unless the
 * toggle is on, and dedup means repeated/unauthorized hits can't cause
 * duplicate sends.
 */
async function handleRappelsAutoRun(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée.' })
    return
  }
  try {
    const paramRows = await dbList(TABLE_PARAMETRES)
    const parametres = mapParametres(paramRows[0] ?? null)
    if (!parametres.rappelsAutoActifs) {
      res.status(200).json({ actif: false, envoyes: 0 })
      return
    }

    const [rdvRows, emailTemplateRows] = await Promise.all([
      dbList(TABLE_RENDEZVOUS, { select: '*, cliente:clients(nom_complet, email), prestation:prestations(nom, prix)' }),
      dbList(TABLE_EMAIL_TEMPLATES),
    ])

    const rappelTemplate = emailTemplateRows.find((r) => r.cle === 'rappel')
    const nouveauClientTemplate = emailTemplateRows.find((r) => r.cle === 'nouveauClient')

    const rdvCountByClient = new Map<string, number>()
    for (const r of rdvRows) {
      const clienteId = r.cliente_id as string | null
      if (!clienteId) continue
      rdvCountByClient.set(clienteId, (rdvCountByClient.get(clienteId) ?? 0) + 1)
    }
    const hasHistory = (clienteId: string | null) => (clienteId ? (rdvCountByClient.get(clienteId) ?? 0) > 1 : false)

    const now = Date.now()
    const due: { row: DbRow; templateKey: 'rappel' | 'nouveauClient'; template: DbRow }[] = []
    for (const r of rdvRows) {
      if (r.rappel_auto_envoye_le) continue
      if ((r.statut as string) !== 'Confirmé') continue
      const dateStr = r.date as string | null
      if (!dateStr) continue
      const t = new Date(dateStr).getTime()
      if (Number.isNaN(t)) continue
      const diff = t - now
      if (diff <= 0) continue
      const clienteId = r.cliente_id as string | null
      if (hasHistory(clienteId)) {
        if (diff <= 48 * HOUR_MS && rappelTemplate) due.push({ row: r, templateKey: 'rappel', template: rappelTemplate })
      } else if (diff <= 72 * HOUR_MS && nouveauClientTemplate) {
        due.push({ row: r, templateKey: 'nouveauClient', template: nouveauClientTemplate })
      }
    }

    let envoyes = 0
    let echecs = 0
    for (const { row, template } of due) {
      const cliente = row.cliente as { nom_complet?: string; email?: string } | null
      const prestation = row.prestation as { nom?: string; prix?: number } | null
      const email = cliente?.email
      if (!email) continue

      const ctx: TemplateContext = {
        nomComplet: cliente?.nom_complet || 'cliente',
        date: formatDateHeureNaturel(row.date as string),
        prestation: prestation?.nom,
        montant: prestation?.prix ?? undefined,
      }
      const objet = renderTemplate((template.objet as string) ?? '', ctx)
      const corps = renderTemplate((template.corps as string) ?? '', ctx)

      try {
        const result = await sendNewsletterBatch([{ to: email, subject: objet, html: buildTransactionalHtml(corps) }])
        if (result.sent > 0) {
          await dbUpdate(TABLE_RENDEZVOUS, row.id, { rappel_auto_envoye_le: new Date().toISOString() })
          await dbCreate(TABLE_COMMUNICATIONS_LOG, {
            contenu: `Rappel automatique — ${ctx.nomComplet}`,
            type: 'Email',
            destinataires: 1,
            date_envoi: new Date().toISOString(),
          })
          envoyes += 1
        } else {
          echecs += 1
        }
      } catch (error) {
        if (error instanceof EmailConfigError) throw error
        console.error(error)
        echecs += 1
      }
    }

    res.status(200).json({ actif: true, envoyes, echecs })
  } catch (error) {
    if (error instanceof SupabaseConfigError || error instanceof EmailConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: "Impossible d'exécuter les rappels automatiques." })
  }
}

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

/**
 * Liste des factures encaissées (payée = true) sur une période, avec le
 * total par catégorie — pour préparer la déclaration de chiffre d'affaires
 * micro-entreprise/URSSAF. Le champ "date de facture" sert d'approximation
 * de la date d'encaissement, faute d'un champ dédié dans le modèle actuel.
 */
async function handleUrssafExport(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée.' })
    return
  }
  const debut = typeof req.query.debut === 'string' ? req.query.debut : ''
  const fin = typeof req.query.fin === 'string' ? req.query.fin : ''
  if (!debut || !fin) {
    res.status(400).json({ error: 'Les dates de début et de fin sont obligatoires.' })
    return
  }

  try {
    const rows = await dbList(TABLE_FACTURES, { select: '*, cliente:clients(nom_complet)' })
    const enCaisses = rows
      .filter((r) => {
        if (!r.payee) return false
        const d = (r.date_facture as string) ?? ''
        return d >= debut && d <= fin
      })
      .sort((a, b) => ((a.date_facture as string) ?? '').localeCompare((b.date_facture as string) ?? ''))

    const totaux = new Map<string, number>()
    for (const r of enCaisses) {
      const cat = (r.categorie_facture as string) ?? 'Commercial'
      totaux.set(cat, (totaux.get(cat) ?? 0) + ((r.montant as number) ?? 0))
    }

    const lignes: string[] = []
    lignes.push(
      ['Date facture', 'Cliente', 'Description', 'Catégorie', 'Montant (€)'].map(csvEscape).join(';'),
    )
    for (const r of enCaisses) {
      const cliente = r.cliente as { nom_complet?: string } | null
      lignes.push(
        [
          (r.date_facture as string) ?? '',
          cliente?.nom_complet ?? '',
          (r.description as string) ?? '',
          (r.categorie_facture as string) ?? '',
          String((r.montant as number) ?? 0).replace('.', ','),
        ]
          .map(csvEscape)
          .join(';'),
      )
    }
    lignes.push('')
    lignes.push(csvEscape(`Période : du ${debut} au ${fin}`))
    for (const [cat, total] of totaux) {
      lignes.push([csvEscape(`Total encaissé — ${cat}`), csvEscape(`${total.toFixed(2)} €`.replace('.', ','))].join(';'))
    }
    lignes.push(
      csvEscape(
        "Note : le montant encaissé est approximé par la date de facture (aucune date d'encaissement distincte n'est enregistrée).",
      ),
    )

    const csv = '﻿' + lignes.join('\r\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="bella-luna-urssaf-${debut}-au-${fin}.csv"`)
    res.status(200).send(csv)
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      res.status(500).json({ error: error.message })
      return
    }
    console.error(error)
    res.status(502).json({ error: "Impossible de générer l'export URSSAF." })
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  // Public — a recipient clicking this from an email isn't signed into the CRM.
  if (req.query.resource === 'newsletter-unsubscribe') {
    await handleNewsletterUnsubscribe(req, res)
    return
  }

  // Public — triggered by Vercel Cron, which carries no Clerk session. Inert
  // unless "Rappels automatiques" is switched on in Paramètres.
  if (req.query.resource === 'rappels-auto-run') {
    await handleRappelsAutoRun(req, res)
    return
  }

  // Public — the /reserver page a cliente uses isn't signed into the CRM.
  if (req.query.resource === 'public-prestations') {
    await handlePublicPrestations(req, res)
    return
  }
  if (req.query.resource === 'public-disponibilites') {
    await handlePublicDisponibilites(req, res)
    return
  }
  if (req.query.resource === 'public-booking') {
    await handlePublicBooking(req, res)
    return
  }

  try {
    await requireAuth(req)
  } catch (error) {
    res.status(401).json({ error: error instanceof AuthError ? error.message : 'Authentification requise.' })
    return
  }

  if (req.query.resource === 'newsletter-send') {
    await handleNewsletterSend(req, res)
    return
  }
  if (req.query.resource === 'reservation-token') {
    await handleReservationToken(req, res)
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
  if (req.query.resource === 'disponibilites') {
    await handleDisponibilites(req, res)
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
  if (req.query.resource === 'sms-templates') {
    await handleSmsTemplates(req, res)
    return
  }
  if (req.query.resource === 'email-templates') {
    await handleEmailTemplates(req, res)
    return
  }
  if (req.query.resource === 'sync-factures-honorees') {
    await handleSyncFacturesHonorees(req, res)
    return
  }
  if (req.query.resource === 'backup-export') {
    await handleBackupExport(req, res)
    return
  }
  if (req.query.resource === 'urssaf-export') {
    await handleUrssafExport(req, res)
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
          couleur: (r.couleur as string) ?? null,
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
