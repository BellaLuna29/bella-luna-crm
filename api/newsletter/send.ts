import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setCorsHeaders } from '../_lib/cors.js'
import { requireAuth, AuthError } from '../_lib/auth.js'
import { dbGetByIds, UUID_RE } from '../_lib/supabase.js'
import { buildNewsletterHtml, sendNewsletterBatch, EmailConfigError } from '../_lib/email.js'

const SITE_URL = process.env.ALLOWED_ORIGIN || 'https://bella-luna-crm-bella-luna.vercel.app'
const TABLE_CLIENTS = 'clients'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(req, res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée.' })
    return
  }

  try {
    await requireAuth(req)
  } catch (error) {
    res.status(401).json({ error: error instanceof AuthError ? error.message : 'Authentification requise.' })
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
        unsubscribeUrl: `${SITE_URL}/api/newsletter/unsubscribe?id=${c.id}`,
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
