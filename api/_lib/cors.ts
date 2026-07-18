import type { VercelRequest, VercelResponse } from '@vercel/node'

const DEV_ORIGINS = ['http://localhost:5173']
const VERCEL_ORIGIN_RE = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i

export function setCorsHeaders(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin
  const allowedOrigins = [...DEV_ORIGINS, process.env.ALLOWED_ORIGIN].filter(
    (value): value is string => Boolean(value),
  )
  if (origin && (allowedOrigins.includes(origin) || VERCEL_ORIGIN_RE.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}
