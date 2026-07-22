#!/usr/bin/env node
/**
 * One-shot data migration: Airtable (appybml05FLcP9M1j) → Supabase.
 *
 * Run once, after:
 *   1. supabase/schema.sql has been executed on the target Supabase project
 *   2. The Airtable API quota has reset (or upgraded) — this script hits the
 *      same monthly-limited REST API as the live app
 *
 * Usage:
 *   AIRTABLE_API_KEY=pat_... AIRTABLE_BASE_ID=appybml05FLcP9M1j \
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/migrate-to-supabase.mjs
 *
 * Safe to re-run: tables are truncated (in dependency order) before each
 * import, so re-running just re-syncs from Airtable's current state.
 */
import { createClient } from '@supabase/supabase-js'

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

for (const [name, value] of Object.entries({
  AIRTABLE_API_KEY,
  AIRTABLE_BASE_ID,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
})) {
  if (!value) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function airtableList(tableId) {
  const records = []
  let offset
  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}`)
    if (offset) url.searchParams.set('offset', offset)
    const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } })
    if (!res.ok) throw new Error(`Airtable ${tableId} → ${res.status}: ${await res.text()}`)
    const data = await res.json()
    records.push(...data.records)
    offset = data.offset
  } while (offset)
  return records
}

function linked(field) {
  return Array.isArray(field) ? field : []
}

async function insertBatch(table, rows) {
  if (rows.length === 0) return []
  const { data, error } = await sb.from(table).insert(rows).select('id')
  if (error) throw new Error(`Insert into ${table} failed: ${error.message}`)
  return data
}

async function truncate(table) {
  // delete-all trick: match every row via a condition that's always true
  const { error } = await sb.from(table).delete().not('id', 'is', null)
  if (error) throw new Error(`Truncate ${table} failed: ${error.message}`)
}

async function main() {
  console.log('Fetching from Airtable…')
  const [
    clientsAT,
    prestationsAT,
    promotionsAT,
    questionnairesAT,
    rendezvousAT,
    facturesAT,
    depensesAT,
    absencesAT,
    alertesAT,
    alertesLuesAT,
    newsletterStatutAT,
    stockAT,
    parametresAT,
    communicationsLogAT,
  ] = await Promise.all([
    airtableList('tblMKV5WKQ7jtwXq4'), // Clientes
    airtableList('tblDeJttMEKXpYR8X'), // Prestations
    airtableList('tbldqsJCBeZwve20n'), // Promotions
    airtableList('tblhPRz9gsVHoq6mb'), // Questionnaires
    airtableList('tblFF89VWARwjPxus'), // Rendez-vous
    airtableList('tbl3C95q9hjjIVz8W'), // Factures
    airtableList('tblHXhydmHUKycaHd'), // Dépenses
    airtableList('tblW0nybKAtbpDBcV'), // Absences
    airtableList('tblk5PC1ALEQpHovg'), // Alertes
    airtableList('tblqKRi9GGYhxdXM3'), // AlertesLues
    airtableList('tblHtw5e4no105cyq'), // NewsletterStatut
    airtableList('tblYkKjwEJ9oc80zT'), // Stock
    airtableList('tblLC8VINlc1YUdUJ'), // Parametres
    airtableList('tblH4lFlMJ1MN8zOm'), // CommunicationsLog
  ])
  console.log(
    `Fetched: ${clientsAT.length} clients, ${prestationsAT.length} prestations, ${rendezvousAT.length} rdv, ${facturesAT.length} factures, ${depensesAT.length} dépenses.`,
  )

  console.log('Clearing existing Supabase rows (dependency order)…')
  for (const t of [
    'communications_log',
    'parametres',
    'stock',
    'newsletter_statut',
    'alertes_lues',
    'alertes',
    'absences',
    'depenses',
    'factures',
    'rendezvous',
    'questionnaires',
    'promotions',
    'prestations',
    'clients',
  ]) {
    await truncate(t)
  }

  const clientIdMap = new Map() // Airtable recXXX -> Supabase uuid
  const prestationIdMap = new Map()
  const promoIdMap = new Map()

  console.log('Importing clients…')
  for (const r of clientsAT) {
    const f = r.fields
    const [{ id }] = await insertBatch('clients', [
      {
        nom_complet: f['Nom complet'] ?? '',
        telephone: f['Téléphone'] ?? '',
        email: f['Email'] ?? '',
        date_naissance: f['Date de naissance'] ?? null,
        genre: f['Genre'] ?? null,
        metier: f['Métier'] ?? '',
        categorie_metier: f['Catégorie de métier'] ?? null,
        hobbies: f['Hobbies / Sport'] ?? '',
        notes: f['Notes'] ?? '',
        statut: f['Statut'] ?? 'Nouvelle',
        newsletter_ok: Boolean(f['Newsletter OK']),
        created_at: f['Date de création'] ?? r.createdTime,
      },
    ])
    clientIdMap.set(r.id, id)
  }

  console.log('Importing prestations…')
  for (const r of prestationsAT) {
    const f = r.fields
    const [{ id }] = await insertBatch('prestations', [
      {
        nom: f['Nom de la prestation'] ?? '',
        categorie: f['Catégorie'] ?? '',
        duree: f['Durée'] ?? '',
        prix: f['Prix'] ?? 0,
        type: f['Type'] ?? '',
      },
    ])
    prestationIdMap.set(r.id, id)
  }

  console.log('Importing promotions…')
  for (const r of promotionsAT) {
    const f = r.fields
    const [{ id }] = await insertBatch('promotions', [
      {
        nom: f['Nom'] ?? '',
        reduction: f['Réduction'] ?? null,
        active: Boolean(f['Active']),
        date_expiration: f["Date d'expiration"] ?? null,
      },
    ])
    promoIdMap.set(r.id, id)
  }

  console.log('Importing questionnaires…')
  for (const r of questionnairesAT) {
    const f = r.fields
    await insertBatch('questionnaires', [
      {
        nom: f['Nom'] ?? '',
        categorie: f['Catégorie'] ?? '',
        lien: f['Lien Google Form'] ?? '',
        clientes_ciblees: linked(f['Clientes ciblées'])
          .map((oldId) => clientIdMap.get(oldId))
          .filter(Boolean),
      },
    ])
  }

  console.log('Importing rendez-vous…')
  for (const r of rendezvousAT) {
    const f = r.fields
    const clienteOldId = linked(f['Cliente'])[0]
    const prestationOldId = linked(f['Prestation'])[0]
    await insertBatch('rendezvous', [
      {
        date: f['Date'] ?? null,
        statut: f['Statut'] ?? 'Confirmé',
        notes: f['Notes du RDV'] ?? '',
        cliente_id: clienteOldId ? (clientIdMap.get(clienteOldId) ?? null) : null,
        prestation_id: prestationOldId ? (prestationIdMap.get(prestationOldId) ?? null) : null,
        rappel_sms_envoye: Boolean(f['Rappel SMS envoyé']),
        questionnaire_envoye: Boolean(f['Questionnaire envoyé']),
        questionnaire_rempli: Boolean(f['Questionnaire rempli']),
      },
    ])
  }

  console.log('Importing factures (metadata only — PDF attachments are not migrated automatically)…')
  for (const r of facturesAT) {
    const f = r.fields
    const clienteOldId = linked(f['Cliente'])[0]
    const promoOldId = linked(f['Promo appliquée'])[0]
    const pdf = f['Facture PDF']?.[0]
    await insertBatch('factures', [
      {
        date_facture: f['Date de facture'] ?? null,
        montant: f['Montant'] ?? 0,
        payee: Boolean(f['Payée']),
        cliente_id: clienteOldId ? (clientIdMap.get(clienteOldId) ?? null) : null,
        promo_id: promoOldId ? (promoIdMap.get(promoOldId) ?? null) : null,
        email_facture_envoye: Boolean(f['Email facture envoyé']),
        categorie_facture: f['Catégorie de facture'] ?? 'Commercial',
        description: f['Description'] ?? '',
        notes: f['Notes'] ?? '',
        facture_pdf_url: pdf?.url ?? null, // Airtable's signed URL — expires; re-upload separately if needed
        facture_pdf_nom: pdf?.filename ?? null,
      },
    ])
  }

  console.log('Importing dépenses (metadata only — justificatif attachments are not migrated automatically)…')
  for (const r of depensesAT) {
    const f = r.fields
    const justificatif = f['Justificatif']?.[0]
    await insertBatch('depenses', [
      {
        date: f['Date'] ?? null,
        categorie: f['Catégorie'] ?? '',
        description: f['Description'] ?? '',
        montant: f['Montant'] ?? 0,
        recurrente: Boolean(f['Récurrente']),
        justificatif_url: justificatif?.url ?? null,
        justificatif_nom: justificatif?.filename ?? null,
      },
    ])
  }

  console.log('Importing absences…')
  for (const r of absencesAT) {
    const f = r.fields
    await insertBatch('absences', [
      {
        libelle: f['Libellé'] ?? '',
        date_debut: f['Date début'] ?? null,
        date_fin: f['Date fin'] ?? null,
        type: f['Type'] ?? 'Vacances',
      },
    ])
  }

  console.log('Importing alertes…')
  for (const r of alertesAT) {
    const f = r.fields
    await insertBatch('alertes', [
      {
        titre: f['Titre'] ?? '',
        description: f['Description'] ?? '',
        date: f['Date'] ?? null,
        active: f['Active'] !== false,
      },
    ])
  }

  console.log('Importing alertes lues…')
  for (const r of alertesLuesAT) {
    await insertBatch('alertes_lues', [{ cle: r.fields['Clé'] ?? '' }])
  }

  console.log('Importing newsletter statut…')
  for (const r of newsletterStatutAT) {
    const f = r.fields
    await insertBatch('newsletter_statut', [
      { libelle: f['Libellé'] ?? 'Envoi newsletter', dernier_envoi: f['Dernier envoi'] ?? new Date().toISOString() },
    ])
  }

  console.log('Importing stock…')
  for (const r of stockAT) {
    const f = r.fields
    await insertBatch('stock', [
      { nom: f['Nom'] ?? '', quantite: f['Quantité'] ?? 0, seuil_bas: f['Seuil bas'] ?? 0, unite: f['Unité'] ?? '' },
    ])
  }

  console.log('Importing parametres…')
  for (const r of parametresAT) {
    const f = r.fields
    await insertBatch('parametres', [
      {
        libelle: f['Libellé'] ?? 'Studio',
        lundi: f['Lundi'] ?? '',
        mardi: f['Mardi'] ?? '',
        mercredi: f['Mercredi'] ?? '',
        jeudi: f['Jeudi'] ?? '',
        vendredi: f['Vendredi'] ?? '',
        samedi: f['Samedi'] ?? '',
        dimanche: f['Dimanche'] ?? '',
        objectif_ca_mensuel: f['Objectif CA mensuel'] ?? null,
      },
    ])
  }

  console.log('Importing communications log…')
  for (const r of communicationsLogAT) {
    const f = r.fields
    await insertBatch('communications_log', [
      {
        contenu: f['Contenu'] ?? '',
        type: f['Type'] ?? 'SMS',
        destinataires: f['Destinataires'] ?? 0,
        date_envoi: f["Date d'envoi"] ?? new Date().toISOString(),
      },
    ])
  }

  console.log('\n✅ Migration complete.')
  console.log(
    'Note: Facture PDF and Dépense justificatif files were copied by URL reference only (Airtable\'s URLs are signed and expire — download+re-upload separately to supabase Storage if you need those files preserved long-term).',
  )
}

main().catch((err) => {
  console.error('\n❌ Migration failed:', err.message)
  process.exit(1)
})
