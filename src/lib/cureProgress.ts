export interface CureProgressItem {
  id: string
  clienteId: string
  clienteNom: string
  prestationNom: string
  seancesTotales: number
  seancesFaites: number
  seancesRestantes: number
}

interface RdvForCure {
  clienteId: string | null
  clienteNom: string
  prestationId: string | null
  prestationNom: string
  statut: string
}

interface PrestationForCure {
  id: string
  type: string
}

const CURE_TYPE_RE = /cure\s+(\d+)\s*s[ée]ances?/i

/**
 * Détecte les cures (ex. "Cure 8 séances") réservées plusieurs fois par une
 * cliente et calcule où elle en est, à partir de l'historique des
 * rendez-vous honorés — sans dépendre d'une table Cures tenue à la main.
 */
export function computeCureProgress(rendezvous: RdvForCure[], prestations: PrestationForCure[]): CureProgressItem[] {
  const prestationById = new Map(prestations.map((p) => [p.id, p]))
  const byKey = new Map<string, CureProgressItem>()

  for (const r of rendezvous) {
    if (!r.clienteId || !r.prestationId) continue
    const prestation = prestationById.get(r.prestationId)
    if (!prestation) continue
    const match = CURE_TYPE_RE.exec(prestation.type)
    if (!match) continue
    const total = Number(match[1])
    if (!Number.isFinite(total) || total <= 0) continue

    const key = `${r.clienteId}__${r.prestationId}`
    const entry = byKey.get(key) ?? {
      id: key,
      clienteId: r.clienteId,
      clienteNom: r.clienteNom,
      prestationNom: r.prestationNom,
      seancesTotales: total,
      seancesFaites: 0,
      seancesRestantes: total,
    }
    if (r.statut === 'Honoré') entry.seancesFaites += 1
    byKey.set(key, entry)
  }

  return Array.from(byKey.values())
    .map((e) => ({ ...e, seancesRestantes: Math.max(0, e.seancesTotales - e.seancesFaites) }))
    .filter((e) => e.seancesRestantes > 0)
}
