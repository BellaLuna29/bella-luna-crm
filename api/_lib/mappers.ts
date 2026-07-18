import type { AirtableRecord } from './airtable.js'

export interface Client {
  id: string
  nomComplet: string
  telephone: string
  email: string
  dateNaissance: string | null
  metier: string
  categorieMetier: string
  hobbies: string
  notes: string
  statut: string
  newsletter: boolean
  dateCreation: string | null
}

export function mapClient(record: AirtableRecord): Client {
  const f = record.fields
  return {
    id: record.id,
    nomComplet: (f['Nom complet'] as string) ?? '',
    telephone: (f['Téléphone'] as string) ?? '',
    email: (f['Email'] as string) ?? '',
    dateNaissance: (f['Date de naissance'] as string) ?? null,
    metier: (f['Métier'] as string) ?? '',
    categorieMetier: (f['Catégorie de métier'] as string) ?? '',
    hobbies: (f['Hobbies / Sport'] as string) ?? '',
    notes: (f['Notes'] as string) ?? '',
    statut: (f['Statut'] as string) ?? 'Nouvelle',
    newsletter: Boolean(f['Newsletter OK']),
    dateCreation: (f['Date de création'] as string) ?? null,
  }
}

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
 * Validates and maps a raw request body into Airtable field names.
 * `requireName` enforces "Nom complet" as mandatory (create only).
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
    if (v.length > 0) fields['Nom complet'] = v
  }

  if ('telephone' in b) {
    const v = typeof b.telephone === 'string' ? b.telephone.trim() : ''
    if (v.length > 30) errors.push('Le téléphone est trop long.')
    else fields['Téléphone'] = v
  }

  if ('email' in b) {
    const v = typeof b.email === 'string' ? b.email.trim() : ''
    if (v.length > 0 && !EMAIL_RE.test(v)) errors.push("L'adresse e-mail n'est pas valide.")
    else if (v.length > 200) errors.push("L'adresse e-mail est trop longue.")
    else fields['Email'] = v
  }

  if ('dateNaissance' in b) {
    const v = b.dateNaissance
    if (v === null || v === '') {
      fields['Date de naissance'] = null
    } else if (typeof v === 'string' && DATE_RE.test(v)) {
      fields['Date de naissance'] = v
    } else {
      errors.push('La date de naissance doit être au format AAAA-MM-JJ.')
    }
  }

  if ('metier' in b) {
    const v = typeof b.metier === 'string' ? b.metier.trim() : ''
    if (v.length > 200) errors.push('Le métier est trop long.')
    else fields['Métier'] = v
  }

  if ('categorieMetier' in b) {
    const v = b.categorieMetier
    if (v === '' || v === null) {
      fields['Catégorie de métier'] = null
    } else if (typeof v === 'string' && (CATEGORIE_METIER_VALUES as readonly string[]).includes(v)) {
      fields['Catégorie de métier'] = v
    } else {
      errors.push('Catégorie de métier invalide.')
    }
  }

  if ('hobbies' in b) {
    const v = typeof b.hobbies === 'string' ? b.hobbies.trim() : ''
    if (v.length > 200) errors.push('Le champ hobbies/sport est trop long (200 caractères max).')
    else fields['Hobbies / Sport'] = v
  }

  if ('notes' in b) {
    const v = typeof b.notes === 'string' ? b.notes.trim() : ''
    if (v.length > 5000) errors.push('La note est trop longue (5000 caractères max).')
    else fields['Notes'] = v
  }

  if ('statut' in b) {
    const v = b.statut
    if (typeof v === 'string' && (STATUT_VALUES as readonly string[]).includes(v)) {
      fields['Statut'] = v
    } else {
      errors.push('Statut invalide.')
    }
  } else if (requireName) {
    fields['Statut'] = 'Nouvelle'
  }

  if ('newsletter' in b) {
    fields['Newsletter OK'] = Boolean(b.newsletter)
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

/**
 * Validates and maps a raw request body into Airtable field names for the
 * Factures table. `requireCore` enforces cliente/montant/date as mandatory
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
    if (typeof v === 'string' && RECORD_ID_RE.test(v)) {
      fields['Cliente'] = [v]
    } else if (requireCore) {
      errors.push('La cliente est obligatoire.')
    }
  }

  if ('montant' in b || requireCore) {
    const v = b.montant
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      fields['Montant'] = v
    } else if (requireCore) {
      errors.push('Le montant est obligatoire et doit être un nombre positif.')
    }
  }

  if ('dateFacture' in b || requireCore) {
    const v = b.dateFacture
    if (typeof v === 'string' && DATE_RE.test(v)) {
      fields['Date de facture'] = v
    } else if (requireCore) {
      errors.push('La date de facture est obligatoire (format AAAA-MM-JJ).')
    }
  }

  if ('payee' in b) {
    fields['Payée'] = Boolean(b.payee)
  } else if (requireCore) {
    fields['Payée'] = false
  }

  if ('categorieFacture' in b) {
    const v = b.categorieFacture
    if (typeof v === 'string' && (CATEGORIE_FACTURE_VALUES as readonly string[]).includes(v)) {
      fields['Catégorie de facture'] = v
    } else {
      errors.push('Catégorie de facture invalide.')
    }
  } else if (requireCore) {
    fields['Catégorie de facture'] = 'Commercial'
  }

  if ('promoId' in b) {
    const v = b.promoId
    if (v === '' || v === null) {
      fields['Promo appliquée'] = []
    } else if (typeof v === 'string' && RECORD_ID_RE.test(v)) {
      fields['Promo appliquée'] = [v]
    } else {
      errors.push('Promotion invalide.')
    }
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

export const CATEGORIE_FACTURE_VALUES = ['Commercial', 'Associatif ou formation'] as const

/**
 * Validates and maps a raw request body into Airtable field names for the
 * Dépenses table. `requireCore` enforces date/description/montant as
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
      fields['Date'] = v
    } else if (requireCore) {
      errors.push('La date est obligatoire (format AAAA-MM-JJ).')
    }
  }

  if ('categorie' in b) {
    const v = typeof b.categorie === 'string' ? b.categorie.trim() : ''
    if (v.length > 100) errors.push('La catégorie est trop longue.')
    else if (v.length > 0) fields['Catégorie'] = v
  }

  if ('description' in b || requireCore) {
    const v = typeof b.description === 'string' ? b.description.trim() : ''
    if (requireCore && v.length === 0) {
      errors.push('La description est obligatoire.')
    } else if (v.length > 500) {
      errors.push('La description est trop longue (500 caractères max).')
    }
    if (v.length > 0) fields['Description'] = v
  }

  if ('montant' in b || requireCore) {
    const v = b.montant
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      fields['Montant'] = v
    } else if (requireCore) {
      errors.push('Le montant est obligatoire et doit être un nombre positif.')
    }
  }

  if ('recurrente' in b) {
    fields['Récurrente'] = Boolean(b.recurrente)
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

export const RDV_STATUT_VALUES = ['Confirmé', 'Honoré', 'Annulé'] as const
const RECORD_ID_RE = /^rec[a-zA-Z0-9]{14}$/
const MAX_NOTES = 5000

/**
 * Validates and maps a raw request body into Airtable field names for the
 * Rendez-vous table. `requireCore` enforces cliente/prestation/date as
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
    if (typeof v === 'string' && RECORD_ID_RE.test(v)) {
      fields['Cliente'] = [v]
    } else if (requireCore) {
      errors.push('La cliente est obligatoire.')
    }
  }

  if ('prestationId' in b || requireCore) {
    const v = b.prestationId
    if (typeof v === 'string' && RECORD_ID_RE.test(v)) {
      fields['Prestation'] = [v]
    } else if (requireCore) {
      errors.push('La prestation est obligatoire.')
    }
  }

  if ('date' in b || requireCore) {
    const v = b.date
    const parsed = typeof v === 'string' ? new Date(v) : null
    if (parsed && !Number.isNaN(parsed.getTime())) {
      fields['Date'] = parsed.toISOString()
    } else if (requireCore) {
      errors.push('La date et heure sont obligatoires.')
    }
  }

  if ('statut' in b) {
    const v = b.statut
    if (typeof v === 'string' && (RDV_STATUT_VALUES as readonly string[]).includes(v)) {
      fields['Statut'] = v
    } else {
      errors.push('Statut de rendez-vous invalide.')
    }
  } else if (requireCore) {
    fields['Statut'] = 'Confirmé'
  }

  if ('notes' in b) {
    const v = typeof b.notes === 'string' ? b.notes.trim() : ''
    if (v.length > MAX_NOTES) errors.push(`La note est trop longue (${MAX_NOTES} caractères max).`)
    else fields['Notes du RDV'] = v
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

/**
 * Validates and maps a raw request body into Airtable field names for the
 * Questionnaires table. `requireCore` enforces nom/lien as mandatory (create only).
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
    if (v.length > 0) fields['Nom'] = v
  }

  if ('categorie' in b) {
    const v = typeof b.categorie === 'string' ? b.categorie.trim() : ''
    fields['Catégorie'] = v
  }

  if ('lien' in b || requireCore) {
    const v = typeof b.lien === 'string' ? b.lien.trim() : ''
    if (requireCore && v.length === 0) errors.push('Le lien du formulaire est obligatoire.')
    else if (v.length > 0 && !/^https?:\/\//i.test(v)) errors.push('Le lien doit être une URL valide.')
    if (v.length > 0) fields['Lien Google Form'] = v
  }

  if ('clienteIds' in b) {
    const v = b.clienteIds
    if (Array.isArray(v) && v.every((id) => typeof id === 'string' && RECORD_ID_RE.test(id))) {
      fields['Clientes ciblées'] = v
    } else {
      errors.push('Liste de clientes invalide.')
    }
  }

  if (errors.length > 0) return { errors }
  return { fields }
}

export const ABSENCE_TYPE_VALUES = ['Vacances', 'Jour off', 'Autre'] as const

/**
 * Validates and maps a raw request body into Airtable field names for the
 * Absences table. `requireCore` enforces libellé/dateDebut/dateFin as
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
    if (v.length > 0) fields['Libellé'] = v
  }

  if ('dateDebut' in b || requireCore) {
    const v = b.dateDebut
    if (typeof v === 'string' && DATE_RE.test(v)) {
      fields['Date début'] = v
    } else if (requireCore) {
      errors.push('La date de début est obligatoire (format AAAA-MM-JJ).')
    }
  }

  if ('dateFin' in b || requireCore) {
    const v = b.dateFin
    if (typeof v === 'string' && DATE_RE.test(v)) {
      fields['Date fin'] = v
    } else if (requireCore) {
      errors.push('La date de fin est obligatoire (format AAAA-MM-JJ).')
    }
  }

  if ('type' in b) {
    const v = b.type
    if (typeof v === 'string' && (ABSENCE_TYPE_VALUES as readonly string[]).includes(v)) {
      fields['Type'] = v
    } else {
      errors.push('Type invalide.')
    }
  } else if (requireCore) {
    fields['Type'] = 'Vacances'
  }

  if (errors.length > 0) return { errors }
  return { fields }
}
