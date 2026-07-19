import type { VercelRequest, VercelResponse } from '@vercel/node'

const DEV_ORIGINS = ['http://localhost:5173']

export function setCorsHeaders(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin
  const allowedOrigins = [...DEV_ORIGINS, process.env.ALLOWED_ORIGIN, process.env.VERCEL_URL_ORIGIN].filter(
    (value): value is string => Boolean(value),
  )
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}
