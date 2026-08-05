import type { VercelRequest, VercelResponse } from '@vercel/node'
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
  parseSmsTemplateInput,
  parseEmailTemplateInput,
} from './_lib/mappers.js'
import { buildNewsletterHtml, buildTransactionalHtml, sendNewsletterBatch, EmailConfigError } from './_lib/email.js'
import { renderTemplate, type TemplateContext } from './_lib/templateEngine.js'
import { formatDateHeureNaturel } from './_lib/formatDate.js'
import { cureTotalSeances, cureCyclePosition } from './_lib/cure.js'

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
