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

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildNewsletterHtml({ bodyText, unsubscribeUrl }: { bodyText: string; unsubscribeUrl: string }): string {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 16px;">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')

  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#F4F8F6;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F8F6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #DCE7E1;">
            <tr>
              <td style="background:#3A5A50;padding:28px 32px;text-align:center;">
                <img src="${SITE_URL}/favicon.png" width="48" height="48" alt="Bella Luna" style="border-radius:50%;background:#fff;padding:4px;display:block;margin:0 auto 10px;" />
                <div style="color:#ffffff;font-size:20px;font-weight:600;letter-spacing:0.04em;">Bella Luna</div>
                <div style="color:#C9A86A;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;margin-top:2px;">
                  Institut de massage bien-être
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-size:15px;line-height:1.6;color:#23332D;">
                ${paragraphs}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#F4F8F6;border-top:1px solid #DCE7E1;text-align:center;">
                <p style="margin:0;font-size:11px;color:#6B8074;line-height:1.6;">
                  Vous recevez cet e-mail car vous êtes inscrite à la newsletter de Bella Luna.<br />
                  <a href="${unsubscribeUrl}" style="color:#8A6D2F;">Se désinscrire de la newsletter</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/**
 * Same branded shell as buildNewsletterHtml, without the newsletter
 * unsubscribe footer — for transactional messages (appointment reminders).
 */
export function buildTransactionalHtml(bodyText: string): string {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 16px;">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')

  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#F4F8F6;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F8F6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #DCE7E1;">
            <tr>
              <td style="background:#3A5A50;padding:28px 32px;text-align:center;">
                <img src="${SITE_URL}/favicon.png" width="48" height="48" alt="Bella Luna" style="border-radius:50%;background:#fff;padding:4px;display:block;margin:0 auto 10px;" />
                <div style="color:#ffffff;font-size:20px;font-weight:600;letter-spacing:0.04em;">Bella Luna</div>
                <div style="color:#C9A86A;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;margin-top:2px;">
                  Institut de massage bien-être
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-size:15px;line-height:1.6;color:#23332D;">
                ${paragraphs}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
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
