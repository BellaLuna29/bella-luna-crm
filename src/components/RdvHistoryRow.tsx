import { useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'

interface RdvHistoryRowProps {
  id: string
  date: string
  prestation: string
  prix: string
  initialNotes: string
}

function RdvHistoryRow({ id, date, prestation, prix, initialNotes }: RdvHistoryRowProps) {
  const { getToken } = useAuth()
  const [notes, setNotes] = useState(initialNotes)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialNotes)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await apiFetch<{ notes: string }>(getToken, `/api/rendezvous/${id}`, {
        method: 'PATCH',
        body: { notes: draft },
      })
      setNotes(draft.trim())
      setEditing(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="py-3 border-b border-sage-light last:border-none">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-sage shrink-0" />
          <div>
            <div className="text-xs text-text-muted">{date}</div>
            <div className="text-sm font-semibold">{prestation}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold text-sage-dark">{prix}</div>
          {!editing && (
            <button
              onClick={() => {
                setDraft(notes)
                setEditing(true)
              }}
              className="text-xs font-semibold text-sage-dark hover:underline"
            >
              {notes ? 'Modifier la note' : '+ Note'}
            </button>
          )}
        </div>
      </div>

      {!editing && notes && (
        <p className="mt-2 ml-5 text-sm text-text-muted leading-relaxed">{notes}</p>
      )}

      {editing && (
        <div className="mt-2 ml-5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={5000}
            rows={3}
            autoFocus
            className="input resize-y"
            placeholder="Ex : bien tolérée, préfère pression légère sur le dos..."
          />
          {error && <p className="text-xs text-danger mt-1">{error}</p>}
          <div className="flex gap-2 mt-2">
            <button
              onClick={save}
              disabled={saving}
              className="bg-sage-dark text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:bg-sage-pale"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default RdvHistoryRow
