import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import SearchableSelect from './SearchableSelect'

interface ClientOption {
  id: string
  nomComplet: string
}

interface FactureFormModalProps {
  onClose: () => void
  onSaved: () => void
}

function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function FactureFormModal({ onClose, onSaved }: FactureFormModalProps) {
  const { getToken } = useAuth()
  const [clients, setClients] = useState<ClientOption[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [clienteId, setClienteId] = useState('')
  const [montant, setMontant] = useState('')
  const [dateFacture, setDateFacture] = useState(todayIso())
  const [payee, setPayee] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiFetch<{ clients: ClientOption[] }>(getToken, '/api/clients')
      .then((data) => setClients(data.clients))
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
      })
  }, [getToken])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const montantNum = Number(montant)
    if (!clienteId || !dateFacture || montant.trim().length === 0 || Number.isNaN(montantNum) || montantNum < 0) {
      setError('Cliente, montant (positif) et date sont obligatoires.')
      return
    }

    setSaving(true)
    try {
      await apiFetch(getToken, '/api/factures', {
        method: 'POST',
        body: { clienteId, montant: montantNum, dateFacture, payee },
      })
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  const loading = !clients

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
        <h3 className="font-serif text-xl font-semibold text-sage-dark mb-4">Nouvelle facture</h3>

        {loadError && <p className="text-sm text-danger mb-4">{loadError}</p>}
        {loading && !loadError && <p className="text-sm text-text-muted">Chargement…</p>}

        {!loading && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Cliente *">
              <SearchableSelect
                options={clients!.map((c) => ({ id: c.id, label: c.nomComplet }))}
                value={clienteId}
                onChange={setClienteId}
                placeholder="Rechercher une cliente..."
                emptyLabel="Aucune cliente trouvée."
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Montant (€) *">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  required
                  className="input"
                />
              </Field>
              <Field label="Date de facture *">
                <input
                  type="date"
                  value={dateFacture}
                  onChange={(e) => setDateFacture(e.target.value)}
                  required
                  className="input"
                />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={payee}
                onChange={(e) => setPayee(e.target.checked)}
                className="w-4 h-4"
              />
              Déjà payée
            </label>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex justify-end gap-3 mt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-[10px] text-sm font-semibold text-text-muted hover:bg-sage-pale"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-sage-dark text-white px-5 py-2.5 rounded-[10px] text-sm font-semibold disabled:opacity-50"
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-text-muted mb-1">{label}</span>
      {children}
    </label>
  )
}

export default FactureFormModal
