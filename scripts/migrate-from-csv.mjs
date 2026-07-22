#!/usr/bin/env node
/**
 * One-shot data migration: local Airtable CSV exports (./BDD) → Supabase.
 *
 * Used instead of migrate-to-supabase.mjs because the Airtable REST API is
 * blocked by a monthly quota — the user exported every table to CSV by hand
 * (Airtable's grid-view "Download CSV" button, unrelated to the API quota)
 * and dropped them in ./BDD.
 *
 * Run once, after supabase/schema.sql has been executed on the target
 * Supabase project:
 *
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/migrate-from-csv.mjs
 *
 * Safe to re-run: tables are truncated (in dependency order) before each
 * import.
 *
 * Known gaps (see BDD/README or ask Claude):
 *   - "Cures" table isn't migrated — the app computes cure progress live
 *     from rendezvous + prestations instead of reading a stored table, and
 *     never queries it.
 *   - "Collaborators" CSV is Airtable's own workspace-access metadata, not
 *     app data — intentionally ignored.
 *   - Facture PDF / dépense justificatif attachments aren't in the CSVs
 *     (Airtable CSV export drops attachment binaries, only a temporary
 *     signed URL would have been available) — those fields stay empty;
 *     re-attach manually per record once on Supabase if needed.
 */
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BDD_DIR = path.join(__dirname, '..', 'BDD')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

for (const [name, value] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY })) {
  if (!value) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

function readCsv(filename) {
  const wb = XLSX.readFile(path.join(BDD_DIR, filename), { raw: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { defval: '' })
}

/**
 * Studio is in Quimper, France — wall-clock times in the CSVs are Europe/Paris
 * local time. This script may run on a machine in any timezone (e.g. this
 * sandbox defaults to Europe/London, which is 1h behind Paris even in
 * summer), so timestamps are converted explicitly instead of relying on the
 * host's system timezone. EU DST (CET UTC+1 / CEST UTC+2) switches on the
 * last Sunday of March and October, at 01:00 UTC — same rule France and the
 * rest of the EU have used since 1996.
 */
function parisOffsetHours(year, monthIndex, day) {
  const lastSundayUtc = (y, m) => {
    const d = new Date(Date.UTC(y, m + 1, 0)) // last day of month m (0-indexed)
    d.setUTCDate(d.getUTCDate() - d.getUTCDay())
    return d
  }
  const dstStart = lastSundayUtc(year, 2) // March
  const dstEnd = lastSundayUtc(year, 9) // October
  const testDate = new Date(Date.UTC(year, monthIndex, day))
  return testDate >= dstStart && testDate < dstEnd ? 2 : 1
}

function parisWallClockToIso(y, m, d, h, min) {
  const offset = parisOffsetHours(y, m - 1, d)
  return new Date(Date.UTC(y, m - 1, d, h - offset, min)).toISOString()
}

/**
 * "20/3/2026" or "20/3/2026 09:30" (day/month/year, French export format) →
 * ISO date or datetime. A handful of columns (e.g. Absences) are already
 * ISO ("2026-08-04") straight from Airtable — passed through unchanged.
 */
function parseFrDate(str) {
  if (!str || typeof str !== 'string') return null
  const trimmed = str.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed
  const [datePart, timePart] = trimmed.split(' ')
  const [d, m, y] = datePart.split('/').map(Number)
  if (!d || !m || !y) return null
  if (timePart) {
    const [h, min] = timePart.split(':').map(Number)
    return parisWallClockToIso(y, m, d, h || 0, min || 0)
  }
  const pad = (n) => String(n).padStart(2, '0')
  return `${y}-${pad(m)}-${pad(d)}`
}

/** "6/24/2026 12:33am" (Airtable's CREATED_TIME() default format, month/day/year) → ISO datetime. */
function parseUsDateTime(str) {
  if (!str || typeof str !== 'string') return null
  const match = /^(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+)(am|pm)$/i.exec(str.trim())
  if (!match) return null
  const [, m, d, y, hRaw, min, ampm] = match
  let h = Number(hRaw) % 12
  if (ampm.toLowerCase() === 'pm') h += 12
  return parisWallClockToIso(Number(y), Number(m), Number(d), h, Number(min))
}

function parseMoney(str) {
  if (!str) return 0
  const n = Number(String(str).replace(/[€\s]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function parseChecked(str) {
  return String(str).trim().toLowerCase() === 'checked'
}

function parsePercent(str) {
  if (!str) return null
  const n = Number(String(str).replace('%', '').trim())
  return Number.isFinite(n) ? n / 100 : null
}

async function truncate(table) {
  const { error } = await sb.from(table).delete().not('id', 'is', null)
  if (error) throw new Error(`Truncate ${table} failed: ${error.message}`)
}

async function insertOne(table, row) {
  const { data, error } = await sb.from(table).insert(row).select('id').single()
  if (error) throw new Error(`Insert into ${table} failed (${JSON.stringify(row)}): ${error.message}`)
  return data.id
}

async function main() {
  console.log('Reading CSVs from', BDD_DIR)
  const clientesCsv = readCsv('Bella Luna Clientes Grid View.csv')
  const prestationsCsv = readCsv('Bella Luna Prestations Grid View.csv')
  const promotionsCsv = readCsv('Bella Luna Promotions Grid.csv')
  const questionnairesCsv = readCsv('Bella Luna Questionnaires.csv')
  const rendezvousCsv = readCsv('Bella Luna Rendez-vous Grid View.csv')
  const facturesCsv = readCsv('Bella Luna Invoices.csv')
  const depensesCsv = readCsv('Bella Luna Expenses Grid.csv')
  const absencesCsv = readCsv('Bella Luna Absences Grid.csv')
  const alertesCsv = readCsv('Bella Luna Alertes Grid.csv')
  const newsletterCsv = readCsv('Bella Luna Newsletter Status Grid.csv')
  const stockCsv = readCsv('Bella Luna Stock Grid View.csv')
  const parametresCsv = readCsv('Bella Luna Parameters Grid View.csv')

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

  // ── clients ──────────────────────────────────────────────────────────
  console.log(`Importing ${clientesCsv.length} clients…`)
  const clientIdByName = new Map()
  for (const r of clientesCsv) {
    const id = await insertOne('clients', {
      nom_complet: r['Nom complet'] || '',
      telephone: r['Téléphone'] || '',
      email: r['Email'] || '',
      date_naissance: parseFrDate(r['Date de naissance']),
      genre: r['Genre'] || null,
      metier: r['Métier'] || '',
      categorie_metier: r['Catégorie de métier'] || null,
      hobbies: r['Hobbies / Sport'] || '',
      notes: r['Notes'] || '',
      statut: r['Statut'] || 'Nouvelle',
      newsletter_ok: parseChecked(r['Newsletter OK']),
      created_at: parseUsDateTime(r['Date de création']) ?? new Date().toISOString(),
    })
    clientIdByName.set(r['Nom complet'], id)
  }

  // ── prestations ──────────────────────────────────────────────────────
  console.log(`Importing ${prestationsCsv.length} prestations…`)
  const prestationIdByName = new Map()
  for (const r of prestationsCsv) {
    const id = await insertOne('prestations', {
      nom: r['Nom de la prestation'] || '',
      categorie: r['Catégorie'] || '',
      duree: r['Durée'] || '',
      prix: parseMoney(r['Prix']),
      type: r['Type'] || '',
    })
    prestationIdByName.set(r['Nom de la prestation'], id)
  }

  // ── promotions ───────────────────────────────────────────────────────
  console.log(`Importing ${promotionsCsv.length} promotions…`)
  const promoIdByName = new Map()
  for (const r of promotionsCsv) {
    const id = await insertOne('promotions', {
      nom: r['Nom'] || '',
      reduction: parsePercent(r['Réduction']),
      active: parseChecked(r['Active']),
      date_expiration: parseFrDate(r["Date d'expiration"]),
    })
    promoIdByName.set(r['Nom'], id)
  }

  // ── questionnaires ───────────────────────────────────────────────────
  console.log(`Importing ${questionnairesCsv.length} questionnaires…`)
  for (const r of questionnairesCsv) {
    await insertOne('questionnaires', {
      nom: r['Nom'] || '',
      categorie: r['Catégorie'] || '',
      lien: r['Lien Google Form'] || '',
      clientes_ciblees: [],
    })
  }

  // ── rendezvous ───────────────────────────────────────────────────────
  // Skip rows with neither a cliente nor a prestation — abandoned scratch
  // entries left in the live base (no real appointment data).
  const rdvIdByClientAndDate = new Map() // "clientName|isoDate" -> new uuid
  let rdvSkipped = 0
  console.log(`Importing rendez-vous (${rendezvousCsv.length} rows in source)…`)
  for (const r of rendezvousCsv) {
    const clienteName = r['Cliente']
    const prestationName = r['Prestation']
    if (!clienteName && !prestationName) {
      rdvSkipped++
      continue
    }
    const isoDate = parseFrDate(r['Date'])
    const statut = ['Confirmé', 'Honoré', 'Annulé'].includes(r['Statut']) ? r['Statut'] : 'Confirmé'
    const id = await insertOne('rendezvous', {
      date: isoDate,
      statut,
      notes: r['Notes du RDV'] || '',
      cliente_id: clienteName ? (clientIdByName.get(clienteName) ?? null) : null,
      prestation_id: prestationName ? (prestationIdByName.get(prestationName) ?? null) : null,
      rappel_sms_envoye: parseChecked(r['Rappel SMS envoyé']),
      questionnaire_envoye: parseChecked(r['Questionnaire envoyé']),
      questionnaire_rempli: parseChecked(r['Questionnaire rempli']),
    })
    if (clienteName && isoDate) rdvIdByClientAndDate.set(`${clienteName}|${isoDate}`, id)
  }
  if (rdvSkipped > 0) console.log(`  (skipped ${rdvSkipped} empty scratch rows with no cliente/prestation)`)

  // ── factures ─────────────────────────────────────────────────────────
  console.log(`Importing ${facturesCsv.length} factures…`)
  for (const r of facturesCsv) {
    const clienteName = r['Cliente']
    const promoName = r['Promo appliquée']
    const rdvLieDate = parseFrDate(r['Rendez-vous lié'])
    const rendezvousId = clienteName && rdvLieDate ? (rdvIdByClientAndDate.get(`${clienteName}|${rdvLieDate}`) ?? null) : null
    await insertOne('factures', {
      date_facture: parseFrDate(r['Date de facture']),
      montant: parseMoney(r['Montant']),
      payee: parseChecked(r['Payée']),
      cliente_id: clienteName ? (clientIdByName.get(clienteName) ?? null) : null,
      rendezvous_id: rendezvousId,
      promo_id: promoName ? (promoIdByName.get(promoName) ?? null) : null,
      email_facture_envoye: parseChecked(r['Email facture envoyé']),
      categorie_facture: r['Catégorie de facture'] || 'Commercial',
      description: r['Description'] || '',
      notes: r['Notes'] || '',
    })
  }

  // ── depenses ─────────────────────────────────────────────────────────
  console.log(`Importing ${depensesCsv.length} dépenses…`)
  for (const r of depensesCsv) {
    await insertOne('depenses', {
      date: parseFrDate(r['Date']),
      categorie: r['Catégorie'] || '',
      description: r['Description'] || '',
      montant: parseMoney(r['Montant']),
      recurrente: parseChecked(r['Récurrente']),
    })
  }

  // ── absences ─────────────────────────────────────────────────────────
  console.log(`Importing ${absencesCsv.length} absences…`)
  for (const r of absencesCsv) {
    await insertOne('absences', {
      libelle: r['Libellé'] || '',
      date_debut: parseFrDate(r['Date début']),
      date_fin: parseFrDate(r['Date fin']),
      type: r['Type'] || 'Vacances',
    })
  }

  // ── alertes ──────────────────────────────────────────────────────────
  console.log(`Importing ${alertesCsv.length} alertes…`)
  for (const r of alertesCsv) {
    await insertOne('alertes', {
      titre: r['Titre'] || '',
      description: r['Description'] || '',
      date: parseFrDate(r['Date']),
      active: parseChecked(r['Active']),
    })
  }

  // ── newsletter_statut ────────────────────────────────────────────────
  console.log(`Importing ${newsletterCsv.length} newsletter statut row(s)…`)
  for (const r of newsletterCsv) {
    await insertOne('newsletter_statut', {
      libelle: r['Libellé'] || 'Envoi newsletter',
      dernier_envoi: r['Dernier envoi'] ? new Date(r['Dernier envoi']).toISOString() : new Date().toISOString(),
    })
  }

  // ── stock ────────────────────────────────────────────────────────────
  console.log(`Importing ${stockCsv.length} stock row(s)…`)
  for (const r of stockCsv) {
    await insertOne('stock', {
      nom: r['Nom'] || '',
      quantite: Number(r['Quantité']) || 0,
      seuil_bas: Number(r['Seuil bas']) || 0,
      unite: r['Unité'] || '',
    })
  }

  // ── parametres ───────────────────────────────────────────────────────
  console.log(`Importing ${parametresCsv.length} parametres row(s)…`)
  for (const r of parametresCsv) {
    await insertOne('parametres', {
      libelle: r['Libellé'] || 'Studio',
      lundi: r['Lundi'] || '',
      mardi: r['Mardi'] || '',
      mercredi: r['Mercredi'] || '',
      jeudi: r['Jeudi'] || '',
      vendredi: r['Vendredi'] || '',
      samedi: r['Samedi'] || '',
      dimanche: r['Dimanche'] || '',
      objectif_ca_mensuel: r['Objectif CA mensuel'] ? parseMoney(r['Objectif CA mensuel']) : null,
    })
  }

  console.log('\n✅ Migration complete.')
}

main().catch((err) => {
  console.error('\n❌ Migration failed:', err.message)
  process.exit(1)
})
