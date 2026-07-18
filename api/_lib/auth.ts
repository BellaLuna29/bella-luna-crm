import type { VercelRequest } from '@vercel/node'
import { verifyToken } from '@clerk/backend'

export class AuthError extends Error {}

export async function requireAuth(req: VercelRequest): Promise<string> {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
  const secretKey = process.env.CLERK_SECRET_KEY

  if (!secretKey) {
    throw new AuthError("CLERK_SECRET_KEY n'est pas défini sur Vercel.")
  }
  if (!token) {
    throw new AuthError('Authentification requise.')
  }

  try {
    const payload = await verifyToken(token, { secretKey })
    return payload.sub
  } catch {
    throw new AuthError('Session invalide ou expirée.')
  }
}
