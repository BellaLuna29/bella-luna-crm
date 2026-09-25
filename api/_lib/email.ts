import nodemailer from 'nodemailer'

export class EmailConfigError extends Error {}

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) {
    throw new EmailConfigError("GMAIL_USER et/ou GMAIL_APP_PASSWORD ne sont pas définis sur Vercel.")
  }
  transporter = nodemailer.createTransport({
    service: 'gmail',
    pool: true,
    maxConnections: 5,
    auth: { user, pass },
  })
  return transporter
}

const SITE_URL = process.env.ALLOWED_ORIGIN || 'https://bella-luna-crm-bella-luna.vercel.app'

/** Adresse réellement expéditrice — c'est elle qu'on demande d'ajouter aux contacts. */
function adresseExpedition(): string {
  return process.env.GMAIL_USER || 'bellalunapro29@gmail.com'
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Les webfonts ne chargent que sur une partie des clients (Apple Mail, iOS).
// Les piles complètes sont donc répétées en inline : Gmail et Outlook tombent
// proprement sur Georgia / Segoe sans jamais afficher du Times brut.
const POLICE_TITRE = "'Fraunces', Georgia, 'Iowan Old Style', 'Palatino Linotype', Palatino, serif"
const POLICE_TEXTE =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

// Deux valeurs s'écartent des jetons de l'app, faute de contraste : le sage
// #6B8074 tombait à 3.95:1 sur le fond pâle et l'or #C9A86A à 3.37:1 sur le
// vert foncé — sous le seuil de 4.5:1, en corps 11px.
const SAGE_LISIBLE = '#5F7469' // 4.68:1 sur #F4F8F6
const OR_LISIBLE = '#E3CC9E' // 4.86:1 sur #3A5A50

function paragraphes(bodyText: string): string {
  return bodyText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 18px;">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/**
 * Coquille de marque commune aux deux types d'e-mails. `piedNewsletter` n'est
 * rendu que pour la newsletter : un rappel de rendez-vous n'a pas à proposer
 * une désinscription, on ne se désabonne pas de son propre rendez-vous.
 */
function coquille({ bodyText, piedNewsletter }: { bodyText: string; piedNewsletter?: string }): string {
  const expediteur = escapeHtml(adresseExpedition())
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <link
      href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
  </head>
  <body style="margin:0;padding:0;background:#F4F8F6;font-family:${POLICE_TEXTE};-webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F8F6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #DCE7E1;">
            <tr>
              <td style="background:#3A5A50;padding:30px 32px 26px;text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                  <tr>
                    <td style="background:#ffffff;border-radius:12px;padding:16px 22px;text-align:center;">
                      <!-- Le texte de remplacement est stylé : beaucoup de clients bloquent
                           les images par défaut, l'en-tête ne doit pas se vider pour autant. -->
                      <img
                        src="${SITE_URL}/email-logo.png"
                        width="196"
                        height="96"
                        alt="Bella Luna"
                        border="0"
                        style="display:block;width:196px;height:96px;font-family:${POLICE_TITRE};font-size:23px;color:#3A5A50;line-height:96px;text-align:center;"
                      />
                    </td>
                  </tr>
                </table>
                <div style="font-family:${POLICE_TEXTE};color:${OR_LISIBLE};font-size:11px;font-weight:500;letter-spacing:0.16em;text-transform:uppercase;margin-top:16px;">
                  Institut de massage bien-être
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 32px;font-family:${POLICE_TEXTE};font-size:15.5px;line-height:1.65;color:#23332D;">
                ${paragraphes(bodyText)}
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <div style="height:1px;background:#DCE7E1;line-height:1px;font-size:0;">&nbsp;</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 26px;font-family:${POLICE_TEXTE};font-size:12px;line-height:1.7;color:${SAGE_LISIBLE};text-align:center;">
                Ceci n'est pas un courrier indésirable. Pour être sûre de recevoir nos messages,
                ajoutez <a href="mailto:${expediteur}" style="color:#8A6D2F;font-weight:600;text-decoration:none;">${expediteur}</a>
                à vos contacts.
              </td>
            </tr>
          </table>
          ${piedNewsletter ?? ''}
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export function buildNewsletterHtml({ bodyText, unsubscribeUrl }: { bodyText: string; unsubscribeUrl: string }): string {
  // Hors de la carte et en petit : présent pour qui le cherche, discret pour
  // les autres. Le lien reste une vraie cible tactile (padding + 44px de haut).
  const piedNewsletter = `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
            <tr>
              <td style="padding:18px 24px 4px;text-align:center;font-family:${POLICE_TEXTE};font-size:11.5px;line-height:1.7;color:${SAGE_LISIBLE};">
                Vous recevez cet e-mail car vous êtes inscrite à la newsletter de Bella&nbsp;Luna.
              </td>
            </tr>
            <tr>
              <td style="padding:6px 24px 8px;text-align:center;">
                <a href="${unsubscribeUrl}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 18px;font-family:${POLICE_TEXTE};font-size:11.5px;font-weight:500;color:${SAGE_LISIBLE};text-decoration:underline;">
                  Me désinscrire de la newsletter
                </a>
              </td>
            </tr>
          </table>`
  return coquille({ bodyText, piedNewsletter })
}

/**
 * Même coquille, sans le pied newsletter : pour les messages transactionnels
 * (rappels de rendez-vous), auxquels on ne s'abonne pas.
 */
export function buildTransactionalHtml(bodyText: string): string {
  return coquille({ bodyText })
}

export interface NewsletterSendItem {
  to: string
  subject: string
  html: string
}

export interface NewsletterSendResult {
  sent: number
  failedEmails: string[]
  errorMessage?: string
}

/**
 * Sends each recipient's email through the sender's own Gmail account (SMTP,
 * pooled connections) instead of a transactional-email provider — no domain
 * verification needed, works with any Gmail address + an App Password.
 * Gmail's own daily cap (~500/day for a regular account) is the real ceiling.
 */
export async function sendNewsletterBatch(items: NewsletterSendItem[]): Promise<NewsletterSendResult> {
  if (items.length === 0) return { sent: 0, failedEmails: [] }
  if (items.length > 100) {
    return { sent: 0, failedEmails: items.map((i) => i.to), errorMessage: '100 destinataires maximum par envoi.' }
  }

  const user = process.env.GMAIL_USER
  let mailer: nodemailer.Transporter
  try {
    mailer = getTransporter()
  } catch (error) {
    if (error instanceof EmailConfigError) throw error
    throw error
  }

  const results = await Promise.allSettled(
    items.map((item) =>
      mailer.sendMail({
        from: `Bella Luna <${user}>`,
        to: item.to,
        subject: item.subject,
        html: item.html,
      }),
    ),
  )

  const failedEmails: string[] = []
  let sent = 0
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') sent += 1
    else failedEmails.push(items[i].to)
  })

  return { sent, failedEmails }
}
