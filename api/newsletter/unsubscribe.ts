import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setCorsHeaders } from '../_lib/cors.js'
import { dbGet, dbUpdate, UUID_RE, SupabaseConfigError } from '../_lib/supabase.js'

const TABLE_CLIENTS = 'clients'

function page(title: string, message: string): string {
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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  setCorsHeaders(req, res)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const id = req.query.id
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    res.status(400).send(page('Lien invalide', "Ce lien de désinscription n'est pas valide."))
    return
  }

  try {
    const client = await dbGet(TABLE_CLIENTS, id)
    if (!client) {
      res.status(404).send(page('Introuvable', "Nous n'avons pas trouvé votre fiche cliente."))
      return
    }
    await dbUpdate(TABLE_CLIENTS, id, { newsletter_ok: false })
    const nom = typeof client.nom_complet === 'string' && client.nom_complet ? client.nom_complet : null
    res.status(200).send(
      page(
        'Désinscription confirmée',
        `${nom ? `${nom}, vous` : 'Vous'} ne recevrez plus la newsletter de Bella Luna. À très bientôt !`,
      ),
    )
  } catch (error) {
    if (error instanceof SupabaseConfigError) {
      res.status(500).send(page('Erreur', error.message))
      return
    }
    console.error(error)
    res.status(502).send(page('Erreur', 'Une erreur est survenue, réessaie plus tard.'))
  }
}
