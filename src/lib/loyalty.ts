export interface RdvForLoyalty {
  clienteId: string | null
  clienteNom: string
  statut: string
  prestationCategorie: string
  notes: string
}

export interface LoyaltyMilestone {
  id: string
  clienteId: string
  clienteNom: string
  count: number
  seuil: number
  recompense: string
}

const MASSAGE_CATEGORIES = new Set(['Massage relaxant', 'Massage sportif'])
const CILS_CATEGORIE = 'Extensions de Cil'

// Fallback keyword classification for rendez-vous importés sans prestation_id
// (texte brut de l'agenda dans "notes"), pour que les paliers de fidélité
// tiennent compte de l'historique importé et pas seulement des RDV créés
// depuis l'app.
const MASSAGE_KEYWORDS = /massage|sportif|relaxant|signature|harmonie|[ée]vasion|s[ée]r[ée]nit[ée]/i
const CILS_KEYWORDS = /\bcils?\b|extension|remplissage|\bpose\b/i

function isMassage(r: RdvForLoyalty): boolean {
  if (r.prestationCategorie) return MASSAGE_CATEGORIES.has(r.prestationCategorie)
  return MASSAGE_KEYWORDS.test(r.notes)
}

function isCils(r: RdvForLoyalty): boolean {
  if (r.prestationCategorie) return r.prestationCategorie === CILS_CATEGORIE
  return CILS_KEYWORDS.test(r.notes)
}

function computeMilestones(
  rendezvous: RdvForLoyalty[],
  match: (r: RdvForLoyalty) => boolean,
  seuil: number,
  recompense: string,
): LoyaltyMilestone[] {
  const counts = new Map<string, { count: number; nom: string }>()
  for (const r of rendezvous) {
    if (r.statut !== 'Honoré' || !r.clienteId || !match(r)) continue
    const entry = counts.get(r.clienteId) ?? { count: 0, nom: r.clienteNom }
    entry.count += 1
    counts.set(r.clienteId, entry)
  }

  const out: LoyaltyMilestone[] = []
  for (const [clienteId, { count, nom }] of counts) {
    if (count > 0 && count % seuil === 0) {
      out.push({ id: `${clienteId}-${count}`, clienteId, clienteNom: nom, count, seuil, recompense })
    }
  }
  return out.sort((a, b) => b.count - a.count)
}

/** Tous les 5 massages honorés : -20% sur le prochain massage. */
export function computeFideliteMassage(rendezvous: RdvForLoyalty[]): LoyaltyMilestone[] {
  return computeMilestones(rendezvous, isMassage, 5, '-20% sur le prochain massage')
}

/** Toutes les 8 poses/remplissages de cils honorés : -10€ sur la prochaine visite. */
export function computeFideliteCils(rendezvous: RdvForLoyalty[]): LoyaltyMilestone[] {
  return computeMilestones(rendezvous, isCils, 8, '-10 € sur la prochaine visite')
}

const DRAINAGE_MADERO_CATEGORIES = new Set(['Drainage', 'Madérothérapie', 'Drainage / Madérothérapie'])
const DRAINAGE_MADERO_KEYWORDS = /drainage|mad[ée]ro/i

export function isDrainageOuMadero(r: { prestationCategorie: string; notes: string }): boolean {
  if (r.prestationCategorie) return DRAINAGE_MADERO_CATEGORIES.has(r.prestationCategorie)
  return DRAINAGE_MADERO_KEYWORDS.test(r.notes)
}
