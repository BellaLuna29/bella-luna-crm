#!/usr/bin/env node
/**
 * Reads the local Airtable CSV exports (./BDD) and emits a single SQL file of
 * INSERT statements (to stdout) that recreates every row in Supabase.
 *
 * This is the offline twin of migrate-from-csv.mjs: instead of connecting to
 * Supabase with the service_role key, it prints SQL so the migration can be
 * applied through the Supabase MCP (which holds its own privileged
 * connection) — no secret key ever has to leave the dashboard.
 *
 * Reuses the exact same parsing / Europe-Paris timezone logic. UUIDs are
 * generated here in JS so foreign keys (cliente_id, prestation_id, …) resolve
 * without round-tripping through the database.
 *
 *   node scripts/emit-migration-sql.mjs > /tmp/bella-luna-data.sql
 */
import XLSX from 'xlsx'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BDD_DIR = path.join(__dirname, '..', 'BDD')

function readCsv(filename) {
  const wb = XLSX.readFile(path.join(BDD_DIR, filename), { raw: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { defval: '' })
}

// ── Europe/Paris timezone helpers (identical to migrate-from-csv.mjs) ──────
function parisOffsetHours(year, monthIndex, day) {
  const lastSundayUtc = (y, m) => {
    const d = new Date(Date.UTC(y, m + 1, 0))
    d.setUTCDate(d.getUTCDate() - d.getUTCDay())
    return d
  }
  const dstStart = lastSundayUtc(year, 2)
  const dstEnd = lastSundayUtc(year, 9)
  const testDate = new Date(Date.UTC(year, monthIndex, day))
  return testDate >= dstStart && testDate < dstEnd ? 2 : 1
}

function parisWallClockToIso(y, m, d, h, min) {
  const offset = parisOffsetHours(y, m - 1, d)
  return new Date(Date.UTC(y, m - 1, d, h - offset, min)).toISOString()
}

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

// ── SQL literal helpers ────────────────────────────────────────────────────
function sqlStr(v) {
  if (v === null || v === undefined || v === '') return 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}
function sqlText(v) {
  // NOT NULL text columns default to '' — never emit NULL for these
  if (v === null || v === undefined) return "''"
  return `'${String(v).replace(/'/g, "''")}'`
}
function sqlNum(v) {
  if (v === null || v === undefined || v === '') return 'NULL'
  return String(v)
}
function sqlBool(v) {
  return v ? 'true' : 'false'
}

const out = []
const emit = (s) => out.push(s)

// ── read all CSVs ───────────────────────────────────────────────────────────
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

emit('begin;')
emit('')
emit('-- Clear existing rows (dependency order)')
for (const t of [
  'communications_log', 'parametres', 'stock', 'newsletter_statut',
  'alertes_lues', 'alertes', 'absences', 'depenses', 'factures',
  'rendezvous', 'questionnaires', 'promotions', 'prestations', 'clients',
]) {
  emit(`delete from ${t} where id is not null;`)
}
emit('')

// ── clients ──
const clientIdByName = new Map()
emit('-- clients')
for (const r of clientesCsv) {
  const id = randomUUID()
  clientIdByName.set(r['Nom complet'], id)
  const createdAt = parseUsDateTime(r['Date de création']) ?? new Date().toISOString()
  emit(
    `insert into clients (id, nom_complet, telephone, email, date_naissance, genre, metier, categorie_metier, hobbies, notes, statut, newsletter_ok, created_at) values (` +
    `${sqlStr(id)}, ${sqlText(r['Nom complet'])}, ${sqlText(r['Téléphone'])}, ${sqlText(r['Email'])}, ` +
    `${sqlStr(parseFrDate(r['Date de naissance']))}, ${sqlStr(r['Genre'] || null)}, ${sqlText(r['Métier'])}, ` +
    `${sqlStr(r['Catégorie de métier'] || null)}, ${sqlText(r['Hobbies / Sport'])}, ${sqlText(r['Notes'])}, ` +
    `${sqlStr(r['Statut'] || 'Nouvelle')}, ${sqlBool(parseChecked(r['Newsletter OK']))}, ${sqlStr(createdAt)});`,
  )
}
emit('')

// ── prestations ──
const prestationIdByName = new Map()
emit('-- prestations')
for (const r of prestationsCsv) {
  const id = randomUUID()
  prestationIdByName.set(r['Nom de la prestation'], id)
  emit(
    `insert into prestations (id, nom, categorie, duree, prix, type) values (` +
    `${sqlStr(id)}, ${sqlText(r['Nom de la prestation'])}, ${sqlText(r['Catégorie'])}, ` +
    `${sqlText(r['Durée'])}, ${sqlNum(parseMoney(r['Prix']))}, ${sqlText(r['Type'])});`,
  )
}
emit('')

// ── promotions ──
const promoIdByName = new Map()
emit('-- promotions')
for (const r of promotionsCsv) {
  const id = randomUUID()
  promoIdByName.set(r['Nom'], id)
  emit(
    `insert into promotions (id, nom, reduction, active, date_expiration) values (` +
    `${sqlStr(id)}, ${sqlText(r['Nom'])}, ${sqlNum(parsePercent(r['Réduction']))}, ` +
    `${sqlBool(parseChecked(r['Active']))}, ${sqlStr(parseFrDate(r["Date d'expiration"]))});`,
  )
}
emit('')

// ── questionnaires ──
emit('-- questionnaires')
for (const r of questionnairesCsv) {
  emit(
    `insert into questionnaires (id, nom, categorie, lien, clientes_ciblees) values (` +
    `${sqlStr(randomUUID())}, ${sqlText(r['Nom'])}, ${sqlText(r['Catégorie'])}, ` +
    `${sqlText(r['Lien Google Form'])}, '{}');`,
  )
}
emit('')

// ── rendezvous ──
const rdvIdByClientAndDate = new Map()
let rdvSkipped = 0
emit('-- rendezvous')
for (const r of rendezvousCsv) {
  const clienteName = r['Cliente']
  const prestationName = r['Prestation']
  if (!clienteName && !prestationName) { rdvSkipped++; continue }
  const isoDate = parseFrDate(r['Date'])
  const statut = ['Confirmé', 'Honoré', 'Annulé'].includes(r['Statut']) ? r['Statut'] : 'Confirmé'
  const id = randomUUID()
  const clienteId = clienteName ? (clientIdByName.get(clienteName) ?? null) : null
  const prestationId = prestationName ? (prestationIdByName.get(prestationName) ?? null) : null
  emit(
    `insert into rendezvous (id, date, statut, notes, cliente_id, prestation_id, rappel_sms_envoye, questionnaire_envoye, questionnaire_rempli) values (` +
    `${sqlStr(id)}, ${sqlStr(isoDate)}, ${sqlStr(statut)}, ${sqlText(r['Notes du RDV'])}, ` +
    `${sqlStr(clienteId)}, ${sqlStr(prestationId)}, ${sqlBool(parseChecked(r['Rappel SMS envoyé']))}, ` +
    `${sqlBool(parseChecked(r['Questionnaire envoyé']))}, ${sqlBool(parseChecked(r['Questionnaire rempli']))});`,
  )
  if (clienteName && isoDate) rdvIdByClientAndDate.set(`${clienteName}|${isoDate}`, id)
}
emit(`-- (skipped ${rdvSkipped} empty scratch rows)`)
emit('')

// ── factures ──
emit('-- factures')
for (const r of facturesCsv) {
  const clienteName = r['Cliente']
  const promoName = r['Promo appliquée']
  const rdvLieDate = parseFrDate(r['Rendez-vous lié'])
  const rendezvousId = clienteName && rdvLieDate ? (rdvIdByClientAndDate.get(`${clienteName}|${rdvLieDate}`) ?? null) : null
  const clienteId = clienteName ? (clientIdByName.get(clienteName) ?? null) : null
  const promoId = promoName ? (promoIdByName.get(promoName) ?? null) : null
  emit(
    `insert into factures (id, date_facture, montant, payee, cliente_id, rendezvous_id, promo_id, email_facture_envoye, categorie_facture, description, notes) values (` +
    `${sqlStr(randomUUID())}, ${sqlStr(parseFrDate(r['Date de facture']))}, ${sqlNum(parseMoney(r['Montant']))}, ` +
    `${sqlBool(parseChecked(r['Payée']))}, ${sqlStr(clienteId)}, ${sqlStr(rendezvousId)}, ${sqlStr(promoId)}, ` +
    `${sqlBool(parseChecked(r['Email facture envoyé']))}, ${sqlStr(r['Catégorie de facture'] || 'Commercial')}, ` +
    `${sqlText(r['Description'])}, ${sqlText(r['Notes'])});`,
  )
}
emit('')

// ── depenses ──
emit('-- depenses')
for (const r of depensesCsv) {
  emit(
    `insert into depenses (id, date, categorie, description, montant, recurrente) values (` +
    `${sqlStr(randomUUID())}, ${sqlStr(parseFrDate(r['Date']))}, ${sqlText(r['Catégorie'])}, ` +
    `${sqlText(r['Description'])}, ${sqlNum(parseMoney(r['Montant']))}, ${sqlBool(parseChecked(r['Récurrente']))});`,
  )
}
emit('')

// ── absences ──
emit('-- absences')
for (const r of absencesCsv) {
  emit(
    `insert into absences (id, libelle, date_debut, date_fin, type) values (` +
    `${sqlStr(randomUUID())}, ${sqlText(r['Libellé'])}, ${sqlStr(parseFrDate(r['Date début']))}, ` +
    `${sqlStr(parseFrDate(r['Date fin']))}, ${sqlStr(r['Type'] || 'Vacances')});`,
  )
}
emit('')

// ── alertes ──
emit('-- alertes')
for (const r of alertesCsv) {
  emit(
    `insert into alertes (id, titre, description, date, active) values (` +
    `${sqlStr(randomUUID())}, ${sqlText(r['Titre'])}, ${sqlText(r['Description'])}, ` +
    `${sqlStr(parseFrDate(r['Date']))}, ${sqlBool(parseChecked(r['Active']))});`,
  )
}
emit('')

// ── newsletter_statut ──
emit('-- newsletter_statut')
for (const r of newsletterCsv) {
  const dernier = r['Dernier envoi'] ? new Date(r['Dernier envoi']).toISOString() : new Date().toISOString()
  emit(
    `insert into newsletter_statut (id, libelle, dernier_envoi) values (` +
    `${sqlStr(randomUUID())}, ${sqlStr(r['Libellé'] || 'Envoi newsletter')}, ${sqlStr(dernier)});`,
  )
}
emit('')

// ── stock ──
emit('-- stock')
for (const r of stockCsv) {
  emit(
    `insert into stock (id, nom, quantite, seuil_bas, unite) values (` +
    `${sqlStr(randomUUID())}, ${sqlText(r['Nom'])}, ${Number(r['Quantité']) || 0}, ` +
    `${Number(r['Seuil bas']) || 0}, ${sqlText(r['Unité'])});`,
  )
}
emit('')

// ── parametres ──
emit('-- parametres')
for (const r of parametresCsv) {
  emit(
    `insert into parametres (id, libelle, lundi, mardi, mercredi, jeudi, vendredi, samedi, dimanche, objectif_ca_mensuel) values (` +
    `${sqlStr(randomUUID())}, ${sqlStr(r['Libellé'] || 'Studio')}, ${sqlText(r['Lundi'])}, ${sqlText(r['Mardi'])}, ` +
    `${sqlText(r['Mercredi'])}, ${sqlText(r['Jeudi'])}, ${sqlText(r['Vendredi'])}, ${sqlText(r['Samedi'])}, ` +
    `${sqlText(r['Dimanche'])}, ${r['Objectif CA mensuel'] ? sqlNum(parseMoney(r['Objectif CA mensuel'])) : 'NULL'});`,
  )
}
emit('')
emit('commit;')

process.stdout.write(out.join('\n') + '\n')
process.stderr.write(
  `Emitted: ${clientesCsv.length} clients, ${prestationsCsv.length} prestations, ${promotionsCsv.length} promotions, ` +
  `${questionnairesCsv.length} questionnaires, ${rendezvousCsv.length - rdvSkipped} rendezvous (${rdvSkipped} skipped), ` +
  `${facturesCsv.length} factures, ${depensesCsv.length} depenses, ${absencesCsv.length} absences, ` +
  `${alertesCsv.length} alertes, ${newsletterCsv.length} newsletter, ${stockCsv.length} stock, ${parametresCsv.length} parametres\n`,
)
