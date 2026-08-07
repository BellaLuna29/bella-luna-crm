/**
 * Vercel's Node runtime runs in UTC regardless of where the practitioner is,
 * so Date.getHours()/getMinutes() on the server return UTC — not her local
 * (Europe/Paris) time. Every server-side read of a stored rendez-vous time
 * must go through this instead.
 */
export function parisHeureMinute(date: Date): { heure: number; minute: number } {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date)
  const heure = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return { heure, minute }
}
