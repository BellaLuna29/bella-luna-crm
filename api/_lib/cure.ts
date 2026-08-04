/**
 * Server-side mirror of the "Cure X séances" / "Passeport" detection used by
 * src/lib/cureProgress.ts — same convention, kept separate since api/ and
 * src/ are built as independent bundles.
 */
const CURE_TYPE_RE = /cure\s+(\d+)\s*s[ée]ances?/i

export function cureTotalSeances(prestationType: string): number | null {
  const match = CURE_TYPE_RE.exec(prestationType)
  if (!match) return null
  const total = Number(match[1])
  return Number.isFinite(total) && total > 0 ? total : null
}

/**
 * 1-indexed position of a session within its cure/passeport cycle, counting
 * how many sessions of the same package were already honorées beforehand.
 * Cycles restart after `total` — a client finishing an 8-séances cure and
 * later starting a fresh one lands back on position 1, so it gets invoiced
 * again, but the 2nd–8th session of a single package never do.
 */
export function cureCyclePosition(priorHonoreCount: number, total: number): number {
  return (priorHonoreCount % total) + 1
}
