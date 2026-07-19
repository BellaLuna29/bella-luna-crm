export interface ClientLike {
  id: string
  nomComplet: string
  statut: string
  dateNaissance: string | null
}

export interface RdvLike {
  clienteId: string | null
  date: string | null
}

export interface FactureLike {
  id: string
  date: string | null
  montant: number | null
  payee: boolean
  clienteId: string | null
  clienteNom: string
}

export interface CureLike {
  id: string
  clienteId: string | null
  clienteNom: string
  prestationNom: string
  seancesRestantes: number
}

export interface PromotionLike {
  id: string
  nom: string
  active: boolean
  dateExpiration: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

export function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function daysSince(iso: string, now: Date): number {
  const d = startOfDay(new Date(iso))
  return Math.round((startOfDay(now).getTime() - d.getTime()) / DAY_MS)
}

export function daysUntil(iso: string, now: Date): number {
  const d = startOfDay(new Date(iso))
  return Math.round((d.getTime() - startOfDay(now).getTime()) / DAY_MS)
}

export function daysUntilBirthday(dateNaissance: string, now: Date): number | null {
  const d = new Date(dateNaissance)
  if (Number.isNaN(d.getTime())) return null
  const today = startOfDay(now)
  let next = startOfDay(new Date(now.getFullYear(), d.getMonth(), d.getDate()))
  if (next.getTime() < today.getTime()) {
    next = startOfDay(new Date(now.getFullYear() + 1, d.getMonth(), d.getDate()))
  }
  return Math.round((next.getTime() - today.getTime()) / DAY_MS)
}

export function computeAnniversaires<C extends ClientLike>(clients: C[], now: Date, withinDays = 7) {
  return clients
    .filter((c) => c.dateNaissance)
    .map((c) => ({ client: c, jours: daysUntilBirthday(c.dateNaissance as string, now) }))
    .filter((x): x is { client: C; jours: number } => x.jours !== null && x.jours <= withinDays)
    .sort((a, b) => a.jours - b.jours)
}

export function computeFacturesImpayeesEnRetard<F extends FactureLike>(factures: F[], now: Date, minDays = 14) {
  return factures
    .filter((f) => !f.payee && f.date && daysSince(f.date, now) > minDays)
    .sort((a, b) => daysSince(b.date as string, now) - daysSince(a.date as string, now))
}

export function computeClientesARecontacter<C extends ClientLike, R extends RdvLike>(
  clients: C[],
  rendezvous: R[],
  now: Date,
  minDays = 60,
) {
  const lastRdvByClient = new Map<string, number>()
  for (const r of rendezvous) {
    if (!r.clienteId || !r.date) continue
    const t = new Date(r.date).getTime()
    if (Number.isNaN(t) || t > now.getTime()) continue
    const prev = lastRdvByClient.get(r.clienteId)
    if (!prev || t > prev) lastRdvByClient.set(r.clienteId, t)
  }

  return clients
    .filter((c) => c.statut === 'Régulière')
    .map((c) => {
      const lastTime = lastRdvByClient.get(c.id)
      const jours = lastTime ? Math.round((now.getTime() - lastTime) / DAY_MS) : null
      return { client: c, jours }
    })
    .filter((x) => x.jours === null || x.jours > minDays)
    .sort((a, b) => (b.jours ?? Infinity) - (a.jours ?? Infinity))
}

export function computeCuresBientotTerminees<C extends CureLike>(cures: C[]) {
  return cures.filter((c) => c.seancesRestantes === 1)
}

export function computePromosBientotExpirees<P extends PromotionLike>(promotions: P[], now: Date, withinDays = 14) {
  return promotions
    .filter((p) => p.active && p.dateExpiration && daysUntil(p.dateExpiration, now) >= 0 && daysUntil(p.dateExpiration, now) <= withinDays)
    .sort((a, b) => daysUntil(a.dateExpiration as string, now) - daysUntil(b.dateExpiration as string, now))
}

export function isNewsletterStale(lastSentIso: string | null, now: Date, maxDays = 14): boolean {
  if (!lastSentIso) return true
  const t = new Date(lastSentIso).getTime()
  if (Number.isNaN(t)) return true
  return Math.round((now.getTime() - t) / DAY_MS) > maxDays
}
