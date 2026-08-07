/**
 * Server-side mirror of src/lib/duree.ts's parseDureeMinutes — kept as a
 * separate copy since api/ and src/ are built as independent bundles.
 */
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
