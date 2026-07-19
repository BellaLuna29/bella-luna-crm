export function formatDateHeureNaturel(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const jour = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const h = date.getHours()
  const m = date.getMinutes()
  const heure = m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
  return `${jour} à ${heure}`
}
