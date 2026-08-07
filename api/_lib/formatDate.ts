import { parisHeureMinute } from './timezone.js'

/**
 * Server-side mirror of src/lib/formatDate.ts — kept as a separate copy since
 * api/ and src/ are built as independent bundles. Uses parisHeureMinute
 * instead of Date.getHours()/getMinutes() since the server runs in UTC.
 */
export function formatDateHeureNaturel(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const jour = date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  })
  const { heure: h, minute: m } = parisHeureMinute(date)
  const heure = m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
  return `${jour} à ${heure}`
}
