/** Parses a free-text prestation "durée d'une séance" (e.g. "1h15", "45min") into minutes. */
export function parseDureeMinutes(duree: string): number {
  const hMatch = /(\d+)\s*h\s*(\d+)?/i.exec(duree)
  if (hMatch) {
    const total = Number(hMatch[1]) * 60 + Number(hMatch[2] ?? 0)
    return total > 0 ? total : 60
  }
  const minMatch = /(\d+)\s*min/i.exec(duree)
  if (minMatch) {
    const total = Number(minMatch[1])
    return total > 0 ? total : 60
  }
  return 60
}

export function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}

function formatHeure(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** "De HH:mm à HH:mm" for a rendez-vous starting at `dateIso`, given its total duration in minutes. */
export function formatCreneau(dateIso: string, totalMinutes: number): string | null {
  const start = new Date(dateIso)
  if (Number.isNaN(start.getTime())) return null
  const end = new Date(start.getTime() + totalMinutes * 60000)
  return `${formatHeure(start)} – ${formatHeure(end)}`
}
