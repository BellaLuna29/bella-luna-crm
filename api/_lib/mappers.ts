import type { DbRow } from './supabase.js'
import { UUID_RE } from './supabase.js'

export interface Client {
  id: string
  nomComplet: string
  telephone: string
  email: string
  dateNaissance: string | null
  genre: string
  metier: string
  categorieMetier: string
  hobbies: string
  reseauxSociaux: string
  notes: string
  statut: string
  newsletter: boolean
  dateCreation: string | null
  dejaMasse: boolean | null
  antecedentsMedicaux: string
  zonesASurveiller: string
  pressionSouhaitee: string
  allergies: string
  zonesAEviter: string
}

export function mapClient(row: DbRow): Client {
  return {
    id: row.id,
    nomComplet: (row.nom_complet as string) ?? '',
    telephone: (row.telephone as string) ?? '',
    email: (row.email as string) ?? '',
    dateNaissance: (row.date_naissance as string) ?? null,
    genre: (row.genre as string) ?? '',
    metier: (row.metier as string) ?? '',
    categorieMetier: (row.categorie_metier as string) ?? '',
    hobbies: (row.hobbies as string) ?? '',
    reseauxSociaux: (row.reseaux_sociaux as string) ?? '',
    notes: (row.notes as string) ?? '',
    statut: (row.statut as string) ?? 'Nouvelle',
    newsletter: Boolean(row.newsletter_ok),
    dateCreation: (row.created_at as string) ?? null,
    dejaMasse: row.deja_masse === null || row.deja_masse === undefined ? null : Boolean(row.deja_masse),
    antecedentsMedicaux: (row.antecedents_medicaux as string) ?? '',
    zonesASurveiller: (row.zones_a_surveiller as string) ?? '',
    pressionSouhaitee: (row.pression_souhaitee as string) ?? '',
    allergies: (row.allergies as string) ?? '',
    zonesAEviter: (row.zones_a_eviter as string) ?? '',
  }
}

export const GENRE_VALUES = ['Femme', 'Homme', ''] as const
export const STATUT_VALUES = ['Nouvelle', 'Régulière', 'Inactive'] as const
export const CATEGORIE_METIER_VALUES = [
  'Médecine',
  'Sport',
  'Métier extérieur',
  'Métier de bureau',
  'Commerce',
  'Artisanat',
  'Autre',
] as const

export interface ClientInputErrors {
  errors: string[]
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Validates and maps a raw request body into Postgres column names.
 * `requireName` enforces "nom_complet" as mandatory (create only).
 */
export function parseClientInput(
  body: unknown,
  { requireName }: { requireName: boolean },
): { fields: Record<string, unknown> } | ClientInputErrors {
  if (typeof body !== 'object' || body === null) {
    return { errors: ['Corps de requête invalide.'] }
  }
  const b = body as Record<string, unknown>
  const errors: string[] = []
  const fields: Record<string, unknown> = {}

  if ('nomComplet' in b || requireName) {
    const v = typeof b.nomComplet === 'string' ? b.nomComplet.trim() : ''
    if (requireName && v.length === 0) {
      errors.push('Le nom complet est obligatoire.')
    } else if (v.length > 200) {
      errors.push('Le nom complet est trop long (200 caractères max).')
    }
    if (v.length > 0) fields.nom_complet = v
  }

  if ('telephone' in b) {
    const v = typeof b.telephone === 'string' ? b.telephone.trim() : ''
    if (v.length > 30) errors.push('Le téléphone est trop long.')
    else fields.telephone = v
  }

  if ('email' in b) {
    const v = typeof b.email === 'string' ? b.email.trim() : ''
    if (v.length > 0 && !EMAIL_RE.test(v)) errors.push("L'adresse e-mail n'est pas valide.")
    else if (v.length > 200) errors.push("L'adresse e-mail est trop longue.")
    else fields.email = v
  }

  if ('dateNaissance' in b) {
    const v = b.dateNaissance
    if (v === null || v === '') {
      fields.date_naissance = null
    } else if (typeof v === 'string' && DATE_RE.test(v)) {
      fields.date_naissance = v
    } else {
      errors.push('La date de naissance doit être au format AAAA-MM-JJ.')
    }
  }

  if ('genre' in b) {
    const v = b.genre
    if (v === '' || v === null) {
      fields.genre = null
    } else if (typeof v === 'string' && (GENRE_VALUES as readonly string[]).includes(v)) {
      fields.genre = v
    } else {
      errors.push('Genre invalide.')
    }
  }

  if ('metier' in b) {
    const v = typeof b.metier === 'string' ? b.metier.trim() : ''
    if (v.length > 200) errors.push('Le métier est trop long.')
    else fields.metier = v
  }

  if ('categorieMetier' in b) {
    const v = b.categorieMetier
    if (v === '' || v === null) {
      fields.categorie_metier = null
    } else if (typeof v === 'string' && (CATEGORIE_METIER_VALUES as readonly string[]).includes(v)) {
      fields.categorie_metier = v
    } else {
      errors.push('Catégorie de métier invalide.')
    }
  }

  if ('hobbies' in b) {
    const v = typeof b.hobbies === 'string' ? b.hobbies.trim() : ''
    if (v.length > 200) errors.push('Le champ hobbies/sport est trop long (200 caractères max).')
    else fields.hobbies = v
  }

  if ('reseauxSociaux' in b) {
    const v = typeof b.reseauxSociaux === 'string' ? b.reseauxSociaux.trim() : ''
    if (v.length > 200) errors.push('Le champ réseaux sociaux est trop long (200 caractères max).')
    else fields.reseaux_sociaux = v
  }

  if ('notes' in b) {
    const v = typeof b.notes === 'string' ? b.notes.trim() : ''
    if (v.length > 5000) errors.push('La note est trop longue (5000 caractères max).')
    else fields.notes = v
  }

  if ('dejaMasse' in b) {
    const v = b.dejaMasse
    fields.deja_masse = v === null ? null : Boolean(v)
  }

  const HEALTH_TEXT_FIELDS: [string, string, string][] = [
    ['antecedentsMedicaux', 'antecedents_medicaux', 'Les antécédents médicaux sont trop longs (2000 caractères max).'],
    ['zonesASurveiller', 'zones_a_surveiller', 'Les zones à surveiller sont trop longues (2000 caractères max).'],
    ['pressionSouhaitee', 'pression_souhaitee', 'La pression souhaitée est trop longue (2000 caractères max).'],
    ['allergies', 'allergies', 'Les allergies sont trop longues (2000 caractères max).'],
    ['zonesAEviter', 'zones_a_eviter', 'Les zones à éviter sont trop longues (2000 caractères max).'],
  ]
  for (const [key, column, errorMsg] of HEALTH_TEXT_FIELDS) {
    if (key in b) {
      const v = typeof b[key] === 'string' ? (b[key] as string).trim() : ''
      if (v.length > 2000) errors.push(errorMsg)
      else fields[column] = v
    }
  }

  if ('statut' in b) {
    const v = b.statut
    if (typeof v === 'string' && (STATUT_VALUES as readonly string[]).includes(v)) {
      fields.statut = v
    } else {
      errors.push('Statut invalide.')
    }
  } else if (requireName) {
    fields.statut = 'Nouvelle'
  }

  if ('newsletter' in b) {
    fields.newsletter_ok = Boolean(b.newsletter)
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

/**
 * Validates and maps a raw request body into Postgres column names for the
 * factures table. `requireCore` enforces cliente/montant/date as mandatory
 * (create only).
 */
export function parseFactureInput(
  body: unknown,
  { requireCore }: { requireCore: boolean },
): { fields: Record<string, unknown> } | ClientInputErrors {
  if (typeof body !== 'object' || body === null) {
    return { errors: ['Corps de requête invalide.'] }
  }
  const b = body as Record<string, unknown>
  const errors: string[] = []
  const fields: Record<string, unknown> = {}

  if ('clienteId' in b || requireCore) {
    const v = b.clienteId
    if (typeof v === 'string' && UUID_RE.test(v)) {
      fields.cliente_id = v
    } else if (requireCore) {
      errors.push('La cliente est obligatoire.')
    }
  }

  if ('montant' in b || requireCore) {
    const v = b.montant
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      fields.montant = v
    } else if (requireCore) {
      errors.push('Le montant est obligatoire et doit être un nombre positif.')
    }
  }

  if ('dateFacture' in b || requireCore) {
    const v = b.dateFacture
    if (typeof v === 'string' && DATE_RE.test(v)) {
      fields.date_facture = v
    } else if (requireCore) {
      errors.push('La date de facture est obligatoire (format AAAA-MM-JJ).')
    }
  }

  if ('payee' in b) {
    fields.payee = Boolean(b.payee)
  } else if (requireCore) {
    fields.payee = false
  }

  if ('categorieFacture' in b) {
    const v = b.categorieFacture
    if (typeof v === 'string' && (CATEGORIE_FACTURE_VALUES as readonly string[]).includes(v)) {
      fields.categorie_facture = v
    } else {
      errors.push('Catégorie de facture invalide.')
    }
  } else if (requireCore) {
    fields.categorie_facture = 'Commercial'
  }

  if ('promoId' in b) {
    const v = b.promoId
    if (v === '' || v === null) {
      fields.promo_id = null
    } else if (typeof v === 'string' && UUID_RE.test(v)) {
      fields.promo_id = v
    } else {
      errors.push('Promotion invalide.')
    }
  }

  if ('description' in b) {
    const v = typeof b.description === 'string' ? b.description.trim() : ''
    if (v.length > 200) errors.push('La description est trop longue (200 caractères max).')
    else fields.description = v
  }

  if ('notes' in b) {
    const v = typeof b.notes === 'string' ? b.notes.trim() : ''
    if (v.length > 2000) errors.push('Les notes sont trop longues (2000 caractères max).')
    else fields.notes = v
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

export const CATEGORIE_FACTURE_VALUES = ['Commercial', 'Associatif ou formation'] as const

/**
 * Validates and maps a raw request body into Postgres column names for the
 * depenses table. `requireCore` enforces date/description/montant as
 * mandatory (create only).
 */
export function parseDepenseInput(
  body: unknown,
  { requireCore }: { requireCore: boolean },
): { fields: Record<string, unknown> } | ClientInputErrors {
  if (typeof body !== 'object' || body === null) {
    return { errors: ['Corps de requête invalide.'] }
  }
  const b = body as Record<string, unknown>
  const errors: string[] = []
  const fields: Record<string, unknown> = {}

  if ('date' in b || requireCore) {
    const v = b.date
    if (typeof v === 'string' && DATE_RE.test(v)) {
      fields.date = v
    } else if (requireCore) {
      errors.push('La date est obligatoire (format AAAA-MM-JJ).')
    }
  }

  if ('categorie' in b) {
    const v = typeof b.categorie === 'string' ? b.categorie.trim() : ''
    if (v.length > 100) errors.push('La catégorie est trop longue.')
    else if (v.length > 0) fields.categorie = v
  }

  if ('description' in b || requireCore) {
    const v = typeof b.description === 'string' ? b.description.trim() : ''
    if (requireCore && v.length === 0) {
      errors.push('La description est obligatoire.')
    } else if (v.length > 500) {
      errors.push('La description est trop longue (500 caractères max).')
    }
    if (v.length > 0) fields.description = v
  }

  if ('montant' in b || requireCore) {
    const v = b.montant
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      fields.montant = v
    } else if (requireCore) {
      errors.push('Le montant est obligatoire et doit être un nombre positif.')
    }
  }

  if ('recurrente' in b) {
    fields.recurrente = Boolean(b.recurrente)
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

export const RDV_STATUT_VALUES = ['Confirmé', 'Honoré', 'Annulé', 'En attente'] as const
const MAX_NOTES = 5000

/**
 * Validates and maps a raw request body into Postgres column names for the
 * rendezvous table. `requireCore` enforces cliente/prestation/date as
 * mandatory (create only).
 */
export function parseRendezVousInput(
  body: unknown,
  { requireCore }: { requireCore: boolean },
): { fields: Record<string, unknown> } | ClientInputErrors {
  if (typeof body !== 'object' || body === null) {
    return { errors: ['Corps de requête invalide.'] }
  }
  const b = body as Record<string, unknown>
  const errors: string[] = []
  const fields: Record<string, unknown> = {}

  if ('clienteId' in b || requireCore) {
    const v = b.clienteId
    if (typeof v === 'string' && UUID_RE.test(v)) {
      fields.cliente_id = v
    } else if (requireCore) {
      errors.push('La cliente est obligatoire.')
    }
  }

  if ('prestationId' in b || requireCore) {
    const v = b.prestationId
    if (typeof v === 'string' && UUID_RE.test(v)) {
      fields.prestation_id = v
    } else if (requireCore) {
      errors.push('La prestation est obligatoire.')
    }
  }

  if ('date' in b || requireCore) {
    const v = b.date
    const parsed = typeof v === 'string' ? new Date(v) : null
    if (parsed && !Number.isNaN(parsed.getTime())) {
      fields.date = parsed.toISOString()
    } else if (requireCore) {
      errors.push('La date et heure sont obligatoires.')
    }
  }

  if ('statut' in b) {
    const v = b.statut
    if (typeof v === 'string' && (RDV_STATUT_VALUES as readonly string[]).includes(v)) {
      fields.statut = v
    } else {
      errors.push('Statut de rendez-vous invalide.')
    }
  } else if (requireCore) {
    fields.statut = 'Confirmé'
  }

  if ('notes' in b) {
    const v = typeof b.notes === 'string' ? b.notes.trim() : ''
    if (v.length > MAX_NOTES) errors.push(`La note est trop longue (${MAX_NOTES} caractères max).`)
    else fields.notes = v
  }

  if ('serieId' in b) {
    const v = b.serieId
    if (v === null) {
      fields.serie_id = null
    } else if (typeof v === 'string' && UUID_RE.test(v)) {
      fields.serie_id = v
    } else {
      errors.push('Identifiant de série invalide.')
    }
  }

  if ('minutesSupplementaires' in b) {
    const v = b.minutesSupplementaires
    if (typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0 && v <= 480) {
      fields.minutes_supplementaires = v
    } else {
      errors.push('Le temps supplémentaire doit être un nombre de minutes entre 0 et 480.')
    }
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

/**
 * Validates and maps a raw request body into Postgres column names for the
 * promotions table. `requireCore` enforces nom/réduction as mandatory (create only).
 */
export function parsePromotionInput(
  body: unknown,
  { requireCore }: { requireCore: boolean },
): { fields: Record<string, unknown> } | ClientInputErrors {
  if (typeof body !== 'object' || body === null) {
    return { errors: ['Corps de requête invalide.'] }
  }
  const b = body as Record<string, unknown>
  const errors: string[] = []
  const fields: Record<string, unknown> = {}

  if ('nom' in b || requireCore) {
    const v = typeof b.nom === 'string' ? b.nom.trim() : ''
    if (requireCore && v.length === 0) errors.push('Le nom du code promo est obligatoire.')
    else if (v.length > 200) errors.push('Le nom est trop long.')
    if (v.length > 0) fields.nom = v
  }

  const PROMO_TYPE_REDUCTION_VALUES = ['pourcentage', 'montant'] as const
  if ('typeReduction' in b || requireCore) {
    const v = 'typeReduction' in b ? b.typeReduction : 'pourcentage'
    if (typeof v === 'string' && (PROMO_TYPE_REDUCTION_VALUES as readonly string[]).includes(v)) {
      fields.type_reduction = v
      if (v === 'montant') {
        const mv = b.reductionMontant
        const num = typeof mv === 'number' ? mv : Number(mv)
        if (Number.isFinite(num) && num > 0) {
          fields.reduction_montant = num
          fields.reduction = null
        } else {
          errors.push('Le montant de la réduction doit être un nombre positif.')
        }
      } else {
        const rv = b.reduction
        const num = typeof rv === 'number' ? rv : Number(rv)
        if (Number.isFinite(num) && num > 0 && num <= 1) {
          fields.reduction = num
          fields.reduction_montant = null
        } else {
          errors.push('La réduction doit être comprise entre 0 et 1 (ex. 0.1 pour 10%).')
        }
      }
    } else {
      errors.push('Type de réduction invalide.')
    }
  }

  if ('dateExpiration' in b) {
    const v = b.dateExpiration
    if (v === '' || v === null) fields.date_expiration = null
    else if (typeof v === 'string' && DATE_RE.test(v)) fields.date_expiration = v
    else errors.push("Date d'expiration invalide (format AAAA-MM-JJ).")
  }

  if ('active' in b) {
    fields.active = Boolean(b.active)
  } else if (requireCore) {
    fields.active = true
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

/**
 * Validates and maps a raw request body into Postgres column names for the
 * alertes table. `requireCore` enforces titre as mandatory (create only).
 */
export function parseAlerteInput(
  body: unknown,
  { requireCore }: { requireCore: boolean },
): { fields: Record<string, unknown> } | ClientInputErrors {
  if (typeof body !== 'object' || body === null) {
    return { errors: ['Corps de requête invalide.'] }
  }
  const b = body as Record<string, unknown>
  const errors: string[] = []
  const fields: Record<string, unknown> = {}

  if ('titre' in b || requireCore) {
    const v = typeof b.titre === 'string' ? b.titre.trim() : ''
    if (requireCore && v.length === 0) errors.push('Le titre est obligatoire.')
    else if (v.length > 200) errors.push('Le titre est trop long.')
    if (v.length > 0) fields.titre = v
  }

  if ('description' in b) {
    const v = typeof b.description === 'string' ? b.description.trim() : ''
    if (v.length > 2000) errors.push('La description est trop longue.')
    else fields.description = v
  }

  if ('date' in b) {
    const v = b.date
    if (v === '' || v === null) fields.date = null
    else if (typeof v === 'string' && DATE_RE.test(v)) fields.date = v
    else errors.push('Date invalide (format AAAA-MM-JJ).')
  }

  if ('active' in b) {
    fields.active = Boolean(b.active)
  } else if (requireCore) {
    fields.active = true
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

/**
 * Validates and maps a raw request body into Postgres column names for the
 * questionnaires table. `requireCore` enforces nom/lien as mandatory (create only).
 */
export function parseQuestionnaireInput(
  body: unknown,
  { requireCore }: { requireCore: boolean },
): { fields: Record<string, unknown> } | ClientInputErrors {
  if (typeof body !== 'object' || body === null) {
    return { errors: ['Corps de requête invalide.'] }
  }
  const b = body as Record<string, unknown>
  const errors: string[] = []
  const fields: Record<string, unknown> = {}

  if ('nom' in b || requireCore) {
    const v = typeof b.nom === 'string' ? b.nom.trim() : ''
    if (requireCore && v.length === 0) errors.push('Le nom est obligatoire.')
    else if (v.length > 200) errors.push('Le nom est trop long.')
    if (v.length > 0) fields.nom = v
  }

  if ('categorie' in b) {
    const v = typeof b.categorie === 'string' ? b.categorie.trim() : ''
    fields.categorie = v
  }

  if ('lien' in b || requireCore) {
    const v = typeof b.lien === 'string' ? b.lien.trim() : ''
    if (requireCore && v.length === 0) errors.push('Le lien du formulaire est obligatoire.')
    else if (v.length > 0 && !/^https?:\/\//i.test(v)) errors.push('Le lien doit être une URL valide.')
    if (v.length > 0) fields.lien = v
  }

  if ('clienteIds' in b) {
    const v = b.clienteIds
    if (Array.isArray(v) && v.every((id) => typeof id === 'string' && UUID_RE.test(id))) {
      fields.clientes_ciblees = v
    } else {
      errors.push('Liste de clientes invalide.')
    }
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

export const ABSENCE_TYPE_VALUES = ['Vacances', 'Jour off', 'Autre'] as const
export const ABSENCE_DEMI_JOURNEE_VALUES = ['matin', 'apres-midi'] as const

/**
 * Validates and maps a raw request body into Postgres column names for the
 * absences table. `requireCore` enforces libellé/dateDebut/dateFin as
 * mandatory (create only).
 */
export function parseAbsenceInput(
  body: unknown,
  { requireCore }: { requireCore: boolean },
): { fields: Record<string, unknown> } | ClientInputErrors {
  if (typeof body !== 'object' || body === null) {
    return { errors: ['Corps de requête invalide.'] }
  }
  const b = body as Record<string, unknown>
  const errors: string[] = []
  const fields: Record<string, unknown> = {}

  if ('libelle' in b || requireCore) {
    const v = typeof b.libelle === 'string' ? b.libelle.trim() : ''
    if (requireCore && v.length === 0) {
      errors.push('Le libellé est obligatoire.')
    } else if (v.length > 200) {
      errors.push('Le libellé est trop long.')
    }
    if (v.length > 0) fields.libelle = v
  }

  if ('dateDebut' in b || requireCore) {
    const v = b.dateDebut
    if (typeof v === 'string' && DATE_RE.test(v)) {
      fields.date_debut = v
    } else if (requireCore) {
      errors.push('La date de début est obligatoire (format AAAA-MM-JJ).')
    }
  }

  if ('dateFin' in b || requireCore) {
    const v = b.dateFin
    if (typeof v === 'string' && DATE_RE.test(v)) {
      fields.date_fin = v
    } else if (requireCore) {
      errors.push('La date de fin est obligatoire (format AAAA-MM-JJ).')
    }
  }

  if ('type' in b) {
    const v = b.type
    if (typeof v === 'string' && (ABSENCE_TYPE_VALUES as readonly string[]).includes(v)) {
      fields.type = v
    } else {
      errors.push('Type invalide.')
    }
  } else if (requireCore) {
    fields.type = 'Vacances'
  }

  if ('demiJournee' in b) {
    const v = b.demiJournee
    if (v === null || v === '') {
      fields.demi_journee = null
    } else if (typeof v === 'string' && (ABSENCE_DEMI_JOURNEE_VALUES as readonly string[]).includes(v)) {
      fields.demi_journee = v
    } else {
      errors.push('Demi-journée invalide.')
    }
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

/**
 * Validates and maps a raw request body into Postgres column names for the
 * alertes_lues table. `requireCore` enforces cle as mandatory (create only).
 */
export function parseDismissedAlertInput(
  body: unknown,
  { requireCore }: { requireCore: boolean },
): { fields: Record<string, unknown> } | ClientInputErrors {
  if (typeof body !== 'object' || body === null) {
    return { errors: ['Corps de requête invalide.'] }
  }
  const b = body as Record<string, unknown>
  const errors: string[] = []
  const fields: Record<string, unknown> = {}

  if ('cle' in b || requireCore) {
    const v = typeof b.cle === 'string' ? b.cle.trim() : ''
    if (requireCore && v.length === 0) errors.push('La clé est obligatoire.')
    else if (v.length > 200) errors.push('La clé est trop longue.')
    if (v.length > 0) fields.cle = v
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

export interface StockItem {
  id: string
  nom: string
  quantite: number
  seuilBas: number
  unite: string
}

export function mapStock(row: DbRow): StockItem {
  return {
    id: row.id,
    nom: (row.nom as string) ?? '',
    quantite: (row.quantite as number) ?? 0,
    seuilBas: (row.seuil_bas as number) ?? 0,
    unite: (row.unite as string) ?? '',
  }
}

/**
 * Validates and maps a raw request body into Postgres column names for the
 * stock table. `requireCore` enforces nom/quantite/seuilBas as mandatory
 * (create only).
 */
export function parseStockInput(
  body: unknown,
  { requireCore }: { requireCore: boolean },
): { fields: Record<string, unknown> } | ClientInputErrors {
  if (typeof body !== 'object' || body === null) {
    return { errors: ['Corps de requête invalide.'] }
  }
  const b = body as Record<string, unknown>
  const errors: string[] = []
  const fields: Record<string, unknown> = {}

  if ('nom' in b || requireCore) {
    const v = typeof b.nom === 'string' ? b.nom.trim() : ''
    if (requireCore && v.length === 0) errors.push('Le nom du produit est obligatoire.')
    else if (v.length > 200) errors.push('Le nom est trop long.')
    if (v.length > 0) fields.nom = v
  }

  if ('quantite' in b || requireCore) {
    const v = b.quantite
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) fields.quantite = v
    else if (requireCore) errors.push('La quantité est obligatoire et doit être un nombre positif.')
  }

  if ('seuilBas' in b || requireCore) {
    const v = b.seuilBas
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) fields.seuil_bas = v
    else if (requireCore) errors.push('Le seuil bas est obligatoire et doit être un nombre positif.')
  }

  if ('unite' in b) {
    const v = typeof b.unite === 'string' ? b.unite.trim() : ''
    if (v.length > 50) errors.push("L'unité est trop longue.")
    else fields.unite = v
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

export interface CommunicationLogItem {
  id: string
  contenu: string
  type: string
  destinataires: number
  dateEnvoi: string | null
}

export function mapCommunicationLog(row: DbRow): CommunicationLogItem {
  return {
    id: row.id,
    contenu: (row.contenu as string) ?? '',
    type: (row.type as string) ?? '',
    destinataires: (row.destinataires as number) ?? 0,
    dateEnvoi: (row.date_envoi as string) ?? null,
  }
}

export const COMMUNICATION_TYPE_VALUES = ['SMS', 'Email', 'Newsletter'] as const

/**
 * Validates and maps a raw request body into Postgres column names for the
 * communications_log table. Always mandatory (append-only log, create only).
 */
export function parseCommunicationLogInput(
  body: unknown,
): { fields: Record<string, unknown> } | ClientInputErrors {
  if (typeof body !== 'object' || body === null) {
    return { errors: ['Corps de requête invalide.'] }
  }
  const b = body as Record<string, unknown>
  const errors: string[] = []
  const fields: Record<string, unknown> = {}

  const contenu = typeof b.contenu === 'string' ? b.contenu.trim() : ''
  if (contenu.length === 0) errors.push('Le contenu est obligatoire.')
  else fields.contenu = contenu.slice(0, 200)

  const type = b.type
  if (typeof type === 'string' && (COMMUNICATION_TYPE_VALUES as readonly string[]).includes(type)) {
    fields.type = type
  } else {
    errors.push('Type de communication invalide.')
  }

  const destinataires = b.destinataires
  if (typeof destinataires === 'number' && Number.isFinite(destinataires) && destinataires >= 0) {
    fields.destinataires = destinataires
  } else {
    errors.push('Le nombre de destinataires est obligatoire.')
  }

  fields.date_envoi = new Date().toISOString()

  if (errors.length > 0) return { errors }
  return { fields }
}

export interface Parametres {
  objectifCaMensuel: number | null
  seuilRecontactJours: number
  seuilFactureImpayeeJours: number
  seuilPromoExpirationJours: number
  seuilNewsletterJours: number
  seuilAnniversaireJours: number
  seuilInactiviteLongueJours: number
  rappelsAutoActifs: boolean
}

const SEUIL_COLUMNS = {
  seuilRecontactJours: 'seuil_recontact_jours',
  seuilFactureImpayeeJours: 'seuil_facture_impayee_jours',
  seuilPromoExpirationJours: 'seuil_promo_expiration_jours',
  seuilNewsletterJours: 'seuil_newsletter_jours',
  seuilAnniversaireJours: 'seuil_anniversaire_jours',
  seuilInactiviteLongueJours: 'seuil_inactivite_longue_jours',
} as const
const SEUIL_DEFAULTS = {
  seuilRecontactJours: 30,
  seuilFactureImpayeeJours: 14,
  seuilPromoExpirationJours: 14,
  seuilNewsletterJours: 14,
  seuilAnniversaireJours: 7,
  seuilInactiviteLongueJours: 180,
} as const

export function mapParametres(row: DbRow | null): Parametres {
  const seuils = {} as Record<keyof typeof SEUIL_COLUMNS, number>
  for (const key of Object.keys(SEUIL_COLUMNS) as (keyof typeof SEUIL_COLUMNS)[]) {
    const v = row?.[SEUIL_COLUMNS[key]]
    seuils[key] = typeof v === 'number' && Number.isFinite(v) ? v : SEUIL_DEFAULTS[key]
  }
  return {
    objectifCaMensuel: (row?.objectif_ca_mensuel as number) ?? null,
    ...seuils,
    rappelsAutoActifs: Boolean(row?.rappels_auto_actifs),
  }
}

/**
 * Validates and maps a raw request body into Postgres column names for the
 * parametres table (single-row settings: objectif CA + seuils d'alertes).
 */
export function parseParametresInput(body: unknown): { fields: Record<string, unknown> } | ClientInputErrors {
  if (typeof body !== 'object' || body === null) {
    return { errors: ['Corps de requête invalide.'] }
  }
  const b = body as Record<string, unknown>
  const errors: string[] = []
  const fields: Record<string, unknown> = {}

  if ('objectifCaMensuel' in b) {
    const v = b.objectifCaMensuel
    if (v === null || v === '') {
      fields.objectif_ca_mensuel = null
    } else if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      fields.objectif_ca_mensuel = v
    } else {
      errors.push('Objectif de CA invalide.')
    }
  }

  for (const key of Object.keys(SEUIL_COLUMNS) as (keyof typeof SEUIL_COLUMNS)[]) {
    if (!(key in b)) continue
    const v = b[key]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isInteger(v)) {
      fields[SEUIL_COLUMNS[key]] = v
    } else {
      errors.push(`Le seuil "${key}" doit être un nombre entier positif.`)
    }
  }

  if ('rappelsAutoActifs' in b) {
    fields.rappels_auto_actifs = Boolean(b.rappelsAutoActifs)
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

const MAX_TEMPLATE_CORPS = 3000

/**
 * Validates and maps a raw request body into Postgres column names for the
 * sms_templates table. `requireCore` enforces libellé as mandatory (create only).
 */
export function parseSmsTemplateInput(
  body: unknown,
  { requireCore }: { requireCore: boolean },
): { fields: Record<string, unknown> } | ClientInputErrors {
  if (typeof body !== 'object' || body === null) {
    return { errors: ['Corps de requête invalide.'] }
  }
  const b = body as Record<string, unknown>
  const errors: string[] = []
  const fields: Record<string, unknown> = {}

  if ('libelle' in b || requireCore) {
    const v = typeof b.libelle === 'string' ? b.libelle.trim() : ''
    if (requireCore && v.length === 0) errors.push('Le libellé est obligatoire.')
    else if (v.length > 200) errors.push('Le libellé est trop long.')
    if (v.length > 0) fields.libelle = v
  }

  if ('corps' in b) {
    const v = typeof b.corps === 'string' ? b.corps.trim() : ''
    if (v.length > MAX_TEMPLATE_CORPS) errors.push(`Le message est trop long (${MAX_TEMPLATE_CORPS} caractères max).`)
    else fields.corps = v
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

/**
 * Validates and maps a raw request body into Postgres column names for the
 * email_templates table. `requireCore` enforces libellé as mandatory (create only).
 */
export function parseEmailTemplateInput(
  body: unknown,
  { requireCore }: { requireCore: boolean },
): { fields: Record<string, unknown> } | ClientInputErrors {
  if (typeof body !== 'object' || body === null) {
    return { errors: ['Corps de requête invalide.'] }
  }
  const b = body as Record<string, unknown>
  const errors: string[] = []
  const fields: Record<string, unknown> = {}

  if ('libelle' in b || requireCore) {
    const v = typeof b.libelle === 'string' ? b.libelle.trim() : ''
    if (requireCore && v.length === 0) errors.push('Le libellé est obligatoire.')
    else if (v.length > 200) errors.push('Le libellé est trop long.')
    if (v.length > 0) fields.libelle = v
  }

  if ('objet' in b) {
    const v = typeof b.objet === 'string' ? b.objet.trim() : ''
    if (v.length > 200) errors.push("L'objet est trop long.")
    else fields.objet = v
  }

  if ('corps' in b) {
    const v = typeof b.corps === 'string' ? b.corps.trim() : ''
    if (v.length > MAX_TEMPLATE_CORPS) errors.push(`Le message est trop long (${MAX_TEMPLATE_CORPS} caractères max).`)
    else fields.corps = v
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

/**
 * Validates and maps a raw request body into Postgres column names for the
 * prestations table. `requireCore` enforces nom/prix as mandatory (create
 * only). Catégorie/Type are free text (her existing choices aren't a fixed
 * enum) — Type is used by src/lib/cureProgress.ts to auto-detect cures via
 * a "Cure X séances" pattern, so the UI documents that convention.
 */
export function parsePrestationInput(
  body: unknown,
  { requireCore }: { requireCore: boolean },
): { fields: Record<string, unknown> } | ClientInputErrors {
  if (typeof body !== 'object' || body === null) {
    return { errors: ['Corps de requête invalide.'] }
  }
  const b = body as Record<string, unknown>
  const errors: string[] = []
  const fields: Record<string, unknown> = {}

  if ('nom' in b || requireCore) {
    const v = typeof b.nom === 'string' ? b.nom.trim() : ''
    if (requireCore && v.length === 0) errors.push('Le nom de la prestation est obligatoire.')
    else if (v.length > 200) errors.push('Le nom est trop long.')
    if (v.length > 0) fields.nom = v
  }

  if ('categorie' in b) {
    const v = typeof b.categorie === 'string' ? b.categorie.trim() : ''
    if (v.length > 100) errors.push('La catégorie est trop longue.')
    else fields.categorie = v
  }

  if ('duree' in b) {
    const v = typeof b.duree === 'string' ? b.duree.trim() : ''
    if (v.length > 50) errors.push('La durée est trop longue.')
    else fields.duree = v
  }

  if ('prix' in b || requireCore) {
    const v = b.prix
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) fields.prix = v
    else if (requireCore) errors.push('Le prix est obligatoire et doit être un nombre positif.')
  }

  if ('type' in b) {
    const v = typeof b.type === 'string' ? b.type.trim() : ''
    if (v.length > 100) errors.push('Le type est trop long.')
    else fields.type = v
  }

  if ('couleur' in b) {
    const v = b.couleur
    if (v === null || v === '') {
      fields.couleur = null
    } else if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) {
      fields.couleur = v
    } else {
      errors.push('La couleur doit être un code hexadécimal valide (ex : #6F8E72).')
    }
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

const HEURE_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * Validates and maps a raw request body into Postgres column names for the
 * disponibilites table (weekly availability template — groundwork for a
 * future online-booking page, not yet consumed by anything public).
 */
export function parseDisponibiliteInput(body: unknown): { fields: Record<string, unknown> } | ClientInputErrors {
  if (typeof body !== 'object' || body === null) {
    return { errors: ['Corps de requête invalide.'] }
  }
  const b = body as Record<string, unknown>
  const errors: string[] = []
  const fields: Record<string, unknown> = {}

  if ('actif' in b) {
    fields.actif = Boolean(b.actif)
  }

  if ('heureDebut' in b) {
    const v = b.heureDebut
    if (typeof v === 'string' && HEURE_RE.test(v)) fields.heure_debut = v
    else errors.push('Heure de début invalide (format HH:MM).')
  }

  if ('heureFin' in b) {
    const v = b.heureFin
    if (typeof v === 'string' && HEURE_RE.test(v)) fields.heure_fin = v
    else errors.push('Heure de fin invalide (format HH:MM).')
  }

  if (
    typeof fields.heure_debut === 'string' &&
    typeof fields.heure_fin === 'string' &&
    fields.heure_fin <= fields.heure_debut
  ) {
    errors.push("L'heure de fin doit être après l'heure de début.")
  }

  if (errors.length > 0) return { errors }
  return { fields }
}
