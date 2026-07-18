import type { VercelRequest, VercelResponse } from '@vercel/node'
import { setCorsHeaders } from './_lib/cors.js'

export default function handler(req: VercelRequest, res: VercelResponse): void {
  setCorsHeaders(req, res)
  res.status(200).json({ status: 'ok' })
}
