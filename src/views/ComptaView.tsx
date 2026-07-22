import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import { exportRowsToExcel } from '../lib/exportExcel'
import DepenseFormModal from '../components/DepenseFormModal'
import StockManager from '../components/StockManager'
import { formatMontant } from '../lib/formatMontant'

interface DepenseItem {
  id: string
  date: string | null
  categorie: string
  description: string
  montant: number | null
  recurrente: boolean
  justificatifUrl: string | null
  justificatifNom: string | null
}

interface FactureItem {
  id: string
  date: string | null
  montant: number | null
  payee: boolean
  clienteNom: string
  categorieFacture: string
  promoNom: string
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; depenses: DepenseItem[] }

type SubTab = 'depenses' | 'stock' | 'export'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('fr-FR')
}

function monthKey(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function inRange(iso: string | null, start: string, end: string): boolean {
  if (!iso) return false
  const day = iso.slice(0, 10)
  if (start && day < start) return false
  if (end && day > end) return false
  return true
}

function ComptaView() {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [subTab, setSubTab] = useState<SubTab>('depenses')
  const [showCreate, setShowCreate] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [includeAssociatif, setIncludeAssociatif] = useState(false)
  const [exportDebut, setExportDebut] = useState('')
  const [exportFin, setExportFin] = useState('')
  const [depenseCategorie, setDepenseCategorie] = useState('toutes')
  const [depenseDebut, setDepenseDebut] = useState('')
  const [depenseFin, setDepenseFin] = useState('')

  const load = useCallback(() => {
    setState({ status: 'loading' })
    apiFetch<{ depenses: DepenseItem[] }>(getToken, '/api/depenses')
      .then((data) => setState({ status: 'success', depenses: data.depenses }))
      .catch((error: unknown) => {
        setState({
          status: 'error',
          message: error instanceof ApiError ? error.message : 'Erreur inconnue.',
        })
      })
  }, [getToken])

  useEffect(() => {
    load()
  }, [load])

  const depenseCategories = useMemo(() => {
    if (state.status !== 'success') return []
    return Array.from(new Set(state.depenses.map((d) => d.categorie).filter(Boolean))).sort()
  }, [state])

  const filteredDepenses = useMemo(() => {
    if (state.status !== 'success') return []
    return state.depenses.filter((d) => {
      if (depenseCategorie !== 'toutes' && d.categorie !== depenseCategorie) return false
      if (!inRange(d.date, depenseDebut, depenseFin)) return false
      return true
    })
  }, [state, depenseCategorie, depenseDebut, depenseFin])

  async function exportFactures() {
    setExportError(null)
    setExporting('factures')
    try {
      const { factures } = await apiFetch<{ factures: FactureItem[] }>(getToken, '/api/factures')
      const scoped = factures
        .filter((f) => includeAssociatif || f.categorieFacture !== 'Associatif ou formation')
        .filter((f) => inRange(f.date, exportDebut, exportFin))
      const rows = scoped.map((f) => ({
        Date: formatDate(f.date),
        Cliente: f.clienteNom || 'Cliente inconnue',
        'Montant (€)': f.montant ?? 0,
        Catégorie: f.categorieFacture,
        Promo: f.promoNom || '—',
        Statut: f.payee ? 'Payée' : 'Impayée',
      }))
      exportRowsToExcel(rows, 'Factures', `factures-${todayStamp()}.xlsx`)
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setExporting(null)
    }
  }

  async function exportDepenses() {
    setExportError(null)
    setExporting('depenses')
    try {
      const { depenses } = await apiFetch<{ depenses: DepenseItem[] }>(getToken, '/api/depenses')
      const scoped = depenses.filter((d) => inRange(d.date, exportDebut, exportFin))
      const rows = scoped.map((d) => ({
        Date: formatDate(d.date),
        Catégorie: d.categorie || '—',
        Description: d.description,
        'Montant (€)': d.montant ?? 0,
        Récurrente: d.recurrente ? 'Oui' : 'Non',
      }))
      exportRowsToExcel(rows, 'Dépenses', `depenses-${todayStamp()}.xlsx`)
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setExporting(null)
    }
  }

  async function exportBilan() {
    setExportError(null)
    setExporting('bilan')
    try {
      const [{ factures }, { depenses }] = await Promise.all([
        apiFetch<{ factures: FactureItem[] }>(getToken, '/api/factures'),
        apiFetch<{ depenses: DepenseItem[] }>(getToken, '/api/depenses'),
      ])

      const facturesScoped = factures
        .filter((f) => includeAssociatif || f.categorieFacture !== 'Associatif ou formation')
        .filter((f) => inRange(f.date, exportDebut, exportFin))
      const depensesScoped = depenses.filter((d) => inRange(d.date, exportDebut, exportFin))

      const months = new Map<string, { ca: number; depenses: number }>()
      for (const f of facturesScoped) {
        const key = monthKey(f.date)
        if (!key) continue
        const entry = months.get(key) ?? { ca: 0, depenses: 0 }
        entry.ca += f.montant ?? 0
        months.set(key, entry)
      }
      for (const d of depensesScoped) {
        const key = monthKey(d.date)
        if (!key) continue
        const entry = months.get(key) ?? { ca: 0, depenses: 0 }
        entry.depenses += d.montant ?? 0
        months.set(key, entry)
      }

      const rows = Array.from(months.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => ({
          Mois: monthLabel(key),
          "Chiffre d'affaires (€)": Math.round(v.ca * 100) / 100,
          'Dépenses (€)': Math.round(v.depenses * 100) / 100,
          'Résultat net (€)': Math.round((v.ca - v.depenses) * 100) / 100,
        }))

      exportRowsToExcel(rows, 'Bilan mensuel', `bilan-mensuel-${todayStamp()}.xlsx`)
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setExporting(null)
    }
  }

  function todayStamp(): string {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        {(['depenses', 'stock', 'export'] as SubTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={`px-3.5 py-2 rounded-[10px] text-sm font-semibold transition-colors ${
              subTab === tab ? 'bg-sage-dark text-white' : 'bg-white border border-border text-text-muted hover:bg-sage-pale'
            }`}
          >
            {tab === 'depenses' ? 'Dépenses' : tab === 'stock' ? 'Stock' : 'Export'}
          </button>
        ))}
      </div>

      {subTab === 'depenses' && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={depenseCategorie}
                onChange={(e) => setDepenseCategorie(e.target.value)}
                className="input max-w-56 basis-56 shrink-0"
              >
                <option value="toutes">Toutes catégories</option>
                {depenseCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={depenseDebut}
                onChange={(e) => setDepenseDebut(e.target.value)}
                className="input max-w-40 basis-40 shrink-0"
                aria-label="Depuis le"
              />
              <span className="text-text-muted text-sm">→</span>
              <input
                type="date"
                value={depenseFin}
                onChange={(e) => setDepenseFin(e.target.value)}
                className="input max-w-40 basis-40 shrink-0"
                aria-label="Jusqu'au"
              />
              {(depenseCategorie !== 'toutes' || depenseDebut || depenseFin) && (
                <button
                  onClick={() => {
                    setDepenseCategorie('toutes')
                    setDepenseDebut('')
                    setDepenseFin('')
                  }}
                  className="text-xs font-semibold text-sage-dark hover:underline"
                >
                  Réinitialiser
                </button>
              )}
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="bg-sage-dark text-white px-4.5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-dark/90"
            >
              Nouvelle dépense
            </button>
          </div>

          <div className="bg-white border border-border rounded-2xl overflow-hidden">
            {state.status === 'loading' && <p className="p-6 text-sm text-text-muted">Chargement…</p>}
            {state.status === 'error' && <p className="p-6 text-sm text-danger">{state.message}</p>}

            {state.status === 'success' && (
              <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Date', 'Catégorie', 'Description', 'Montant', 'Récurrente', 'Justificatif'].map((h) => (
                      <th
                        key={h}
                        className="text-left text-[11px] text-text-muted font-semibold uppercase tracking-wide px-4 pb-2.5 pt-4 border-b border-border"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDepenses.map((d) => (
                    <tr key={d.id} className="hover:bg-sage-pale transition-colors">
                      <td className="px-4 py-3.5 border-b border-sage-light text-sm">{formatDate(d.date)}</td>
                      <td className="px-4 py-3.5 border-b border-sage-light text-sm text-text-muted">
                        {d.categorie || '—'}
                      </td>
                      <td className="px-4 py-3.5 border-b border-sage-light text-sm">{d.description}</td>
                      <td className="px-4 py-3.5 border-b border-sage-light text-sm font-semibold">
                        {formatMontant(d.montant)}
                      </td>
                      <td className="px-4 py-3.5 border-b border-sage-light text-sm text-text-muted">
                        {d.recurrente ? 'Oui' : '—'}
                      </td>
                      <td className="px-4 py-3.5 border-b border-sage-light text-sm">
                        {d.justificatifUrl ? (
                          <a
                            href={d.justificatifUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sage-dark font-semibold hover:underline"
                          >
                            {d.justificatifNom || 'Voir le fichier'}
                          </a>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredDepenses.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-muted">
                        Aucune dépense à afficher.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'stock' && <StockManager />}

      {subTab === 'export' && (
        <div className="bg-white border border-border rounded-2xl p-5">
          <h3 className="font-serif text-lg font-semibold text-sage-dark mb-1">Exports Excel</h3>
          <p className="text-sm text-text-muted mb-4">
            Génère un fichier .xlsx que tu peux transmettre directement à ton comptable.
          </p>

          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Période</span>
            <input
              type="date"
              value={exportDebut}
              onChange={(e) => setExportDebut(e.target.value)}
              className="input max-w-40 basis-40 shrink-0"
              aria-label="Depuis le"
            />
            <span className="text-text-muted text-sm">→</span>
            <input
              type="date"
              value={exportFin}
              onChange={(e) => setExportFin(e.target.value)}
              className="input max-w-40 basis-40 shrink-0"
              aria-label="Jusqu'au"
            />
            {(exportDebut || exportFin) && (
              <button
                onClick={() => {
                  setExportDebut('')
                  setExportFin('')
                }}
                className="text-xs font-semibold text-sage-dark hover:underline"
              >
                Réinitialiser
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm mb-4">
            <input
              type="checkbox"
              checked={includeAssociatif}
              onChange={(e) => setIncludeAssociatif(e.target.checked)}
              className="w-4 h-4"
            />
            Inclure les factures « Associatif ou formation » dans les exports
          </label>
          <div className="flex flex-col gap-3 max-w-sm">
            <button
              onClick={exportFactures}
              disabled={exporting !== null}
              className="bg-white border border-border text-sage-dark px-4 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-pale disabled:opacity-50 text-left"
            >
              {exporting === 'factures' ? 'Export en cours…' : 'Exporter les factures'}
            </button>
            <button
              onClick={exportDepenses}
              disabled={exporting !== null}
              className="bg-white border border-border text-sage-dark px-4 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-pale disabled:opacity-50 text-left"
            >
              {exporting === 'depenses' ? 'Export en cours…' : 'Exporter les dépenses'}
            </button>
            <button
              onClick={exportBilan}
              disabled={exporting !== null}
              className="bg-sage-dark text-white px-4 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-dark/90 disabled:opacity-50 text-left"
            >
              {exporting === 'bilan' ? 'Export en cours…' : 'Exporter le bilan mensuel'}
            </button>
          </div>
          {exportError && <p className="text-sm text-danger mt-3">{exportError}</p>}
        </div>
      )}

      {showCreate && (
        <DepenseFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false)
            load()
          }}
        />
      )}
    </div>
  )
}

export default ComptaView
