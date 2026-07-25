import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'

interface SmsTemplate {
  id: string
  cle: string
  libelle: string
  corps: string
}

interface EmailTemplate {
  id: string
  cle: string
  libelle: string
  objet: string
  corps: string
}

const TOKENS_HINT =
  'Jetons disponibles : {{nomComplet}}, {{prestation}}, {{date}}, {{montant}}, {{promoNom}}, {{lienQuestionnaire}}'

function ModelesView() {
  const { getToken } = useAuth()
  const [smsState, setSmsState] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'success'; templates: SmsTemplate[] }
  >({ status: 'loading' })
  const [emailState, setEmailState] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'success'; templates: EmailTemplate[] }
  >({ status: 'loading' })

  const loadSms = useCallback(() => {
    setSmsState({ status: 'loading' })
    apiFetch<{ templates: SmsTemplate[] }>(getToken, '/api/prestations?resource=sms-templates')
      .then((data) => setSmsState({ status: 'success', templates: data.templates }))
      .catch((error: unknown) =>
        setSmsState({ status: 'error', message: error instanceof ApiError ? error.message : 'Erreur inconnue.' }),
      )
  }, [getToken])

  const loadEmail = useCallback(() => {
    setEmailState({ status: 'loading' })
    apiFetch<{ templates: EmailTemplate[] }>(getToken, '/api/prestations?resource=email-templates')
      .then((data) => setEmailState({ status: 'success', templates: data.templates }))
      .catch((error: unknown) =>
        setEmailState({ status: 'error', message: error instanceof ApiError ? error.message : 'Erreur inconnue.' }),
      )
  }, [getToken])

  useEffect(() => {
    loadSms()
    loadEmail()
  }, [loadSms, loadEmail])

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-text-muted">{TOKENS_HINT}</p>
      <SmsSection state={smsState} getToken={getToken} reload={loadSms} />
      <EmailSection state={emailState} getToken={getToken} reload={loadEmail} />
    </div>
  )
}

type GetToken = () => Promise<string | null>

function SmsSection({
  state,
  getToken,
  reload,
}: {
  state: { status: 'loading' } | { status: 'error'; message: string } | { status: 'success'; templates: SmsTemplate[] }
  getToken: GetToken
  reload: () => void
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [libelle, setLibelle] = useState('')
  const [corps, setCorps] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLibelle, setEditLibelle] = useState('')
  const [editCorps, setEditCorps] = useState('')
  const [rowError, setRowError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!libelle.trim()) {
      setFormError('Le libellé est obligatoire.')
      return
    }
    setSaving(true)
    try {
      await apiFetch(getToken, '/api/prestations?resource=sms-templates', {
        method: 'POST',
        body: { libelle: libelle.trim(), corps: corps.trim() },
      })
      setLibelle('')
      setCorps('')
      setShowCreate(false)
      reload()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(t: SmsTemplate) {
    setEditingId(t.id)
    setEditLibelle(t.libelle)
    setEditCorps(t.corps)
    setRowError(null)
  }

  async function saveEdit(id: string) {
    setRowError(null)
    try {
      await apiFetch(getToken, `/api/prestations?resource=sms-templates&id=${id}`, {
        method: 'PATCH',
        body: { libelle: editLibelle.trim(), corps: editCorps.trim() },
      })
      setEditingId(null)
      reload()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    }
  }

  async function handleDelete(id: string) {
    setRowError(null)
    try {
      await apiFetch(getToken, `/api/prestations?resource=sms-templates&id=${id}`, { method: 'DELETE' })
      reload()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    }
  }

  return (
    <div className="bg-white border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h3 className="font-serif text-lg font-semibold text-sage-dark">Modèles SMS</h3>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="bg-sage-dark text-white px-4 py-2 rounded-[10px] text-sm font-semibold hover:bg-sage-dark/90"
        >
          Ajouter un modèle SMS
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-sage-pale rounded-2xl p-4 mb-4 flex flex-col gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-text-muted mb-1">Libellé *</span>
            <input type="text" value={libelle} onChange={(e) => setLibelle(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-text-muted mb-1">Message</span>
            <textarea value={corps} onChange={(e) => setCorps(e.target.value)} rows={4} className="input resize-y" />
          </label>
          {formError && <p className="text-sm text-danger">{formError}</p>}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2.5 rounded-[10px] text-sm font-semibold text-text-muted hover:bg-white"
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

      {rowError && <p className="text-sm text-danger mb-3">{rowError}</p>}

      {state.status === 'loading' && <p className="text-sm text-text-muted">Chargement…</p>}
      {state.status === 'error' && <p className="text-sm text-danger">{state.message}</p>}
      {state.status === 'success' && (
        <div className="flex flex-col gap-3">
          {state.templates.length === 0 ? (
            <p className="text-sm text-text-muted">Aucun modèle SMS.</p>
          ) : (
            state.templates.map((t) =>
              editingId === t.id ? (
                <div key={t.id} className="bg-sage-pale rounded-xl p-4 flex flex-col gap-3">
                  <input
                    type="text"
                    value={editLibelle}
                    onChange={(e) => setEditLibelle(e.target.value)}
                    className="input"
                  />
                  <textarea
                    value={editCorps}
                    onChange={(e) => setEditCorps(e.target.value)}
                    rows={4}
                    className="input resize-y"
                  />
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs font-semibold text-text-muted hover:underline"
                    >
                      Annuler
                    </button>
                    <button onClick={() => saveEdit(t.id)} className="text-xs font-semibold text-sage-dark hover:underline">
                      Enregistrer
                    </button>
                  </div>
                </div>
              ) : (
                <div key={t.id} className="rounded-xl p-4 bg-sage-pale/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{t.libelle}</div>
                      <p className="text-xs text-text-muted mt-1 whitespace-pre-line">{t.corps || '—'}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => startEdit(t)}
                        className="text-xs font-semibold text-sage-dark hover:underline"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="text-xs font-semibold text-danger hover:underline"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              ),
            )
          )}
        </div>
      )}
    </div>
  )
}

function EmailSection({
  state,
  getToken,
  reload,
}: {
  state: { status: 'loading' } | { status: 'error'; message: string } | { status: 'success'; templates: EmailTemplate[] }
  getToken: GetToken
  reload: () => void
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [libelle, setLibelle] = useState('')
  const [objet, setObjet] = useState('')
  const [corps, setCorps] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLibelle, setEditLibelle] = useState('')
  const [editObjet, setEditObjet] = useState('')
  const [editCorps, setEditCorps] = useState('')
  const [rowError, setRowError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!libelle.trim()) {
      setFormError('Le libellé est obligatoire.')
      return
    }
    setSaving(true)
    try {
      await apiFetch(getToken, '/api/prestations?resource=email-templates', {
        method: 'POST',
        body: { libelle: libelle.trim(), objet: objet.trim(), corps: corps.trim() },
      })
      setLibelle('')
      setObjet('')
      setCorps('')
      setShowCreate(false)
      reload()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(t: EmailTemplate) {
    setEditingId(t.id)
    setEditLibelle(t.libelle)
    setEditObjet(t.objet)
    setEditCorps(t.corps)
    setRowError(null)
  }

  async function saveEdit(id: string) {
    setRowError(null)
    try {
      await apiFetch(getToken, `/api/prestations?resource=email-templates&id=${id}`, {
        method: 'PATCH',
        body: { libelle: editLibelle.trim(), objet: editObjet.trim(), corps: editCorps.trim() },
      })
      setEditingId(null)
      reload()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    }
  }

  async function handleDelete(id: string) {
    setRowError(null)
    try {
      await apiFetch(getToken, `/api/prestations?resource=email-templates&id=${id}`, { method: 'DELETE' })
      reload()
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Erreur inconnue.')
    }
  }

  return (
    <div className="bg-white border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h3 className="font-serif text-lg font-semibold text-sage-dark">Modèles e-mail</h3>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="bg-sage-dark text-white px-4 py-2 rounded-[10px] text-sm font-semibold hover:bg-sage-dark/90"
        >
          Ajouter un modèle e-mail
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-sage-pale rounded-2xl p-4 mb-4 flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-text-muted mb-1">Libellé *</span>
              <input type="text" value={libelle} onChange={(e) => setLibelle(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-text-muted mb-1">Objet</span>
              <input type="text" value={objet} onChange={(e) => setObjet(e.target.value)} className="input" />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-semibold text-text-muted mb-1">Message</span>
            <textarea value={corps} onChange={(e) => setCorps(e.target.value)} rows={6} className="input resize-y" />
          </label>
          {formError && <p className="text-sm text-danger">{formError}</p>}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2.5 rounded-[10px] text-sm font-semibold text-text-muted hover:bg-white"
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

      {rowError && <p className="text-sm text-danger mb-3">{rowError}</p>}

      {state.status === 'loading' && <p className="text-sm text-text-muted">Chargement…</p>}
      {state.status === 'error' && <p className="text-sm text-danger">{state.message}</p>}
      {state.status === 'success' && (
        <div className="flex flex-col gap-3">
          {state.templates.length === 0 ? (
            <p className="text-sm text-text-muted">Aucun modèle e-mail.</p>
          ) : (
            state.templates.map((t) =>
              editingId === t.id ? (
                <div key={t.id} className="bg-sage-pale rounded-xl p-4 flex flex-col gap-3">
                  <input
                    type="text"
                    value={editLibelle}
                    onChange={(e) => setEditLibelle(e.target.value)}
                    className="input"
                    placeholder="Libellé"
                  />
                  <input
                    type="text"
                    value={editObjet}
                    onChange={(e) => setEditObjet(e.target.value)}
                    className="input"
                    placeholder="Objet"
                  />
                  <textarea
                    value={editCorps}
                    onChange={(e) => setEditCorps(e.target.value)}
                    rows={6}
                    className="input resize-y"
                  />
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs font-semibold text-text-muted hover:underline"
                    >
                      Annuler
                    </button>
                    <button onClick={() => saveEdit(t.id)} className="text-xs font-semibold text-sage-dark hover:underline">
                      Enregistrer
                    </button>
                  </div>
                </div>
              ) : (
                <div key={t.id} className="rounded-xl p-4 bg-sage-pale/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{t.libelle}</div>
                      {t.objet && <div className="text-xs text-sage-dark font-semibold mt-0.5">{t.objet}</div>}
                      <p className="text-xs text-text-muted mt-1 whitespace-pre-line">{t.corps || '—'}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => startEdit(t)}
                        className="text-xs font-semibold text-sage-dark hover:underline"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="text-xs font-semibold text-danger hover:underline"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              ),
            )
          )}
        </div>
      )}
    </div>
  )
}

export default ModelesView
