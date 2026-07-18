import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'

interface Client {
  id: string
  nomComplet: string
  email: string
  categorieMetier: string
  statut: string
  newsletter: boolean
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; clients: Client[] }

const CATEGORIE_METIER_VALUES = [
  'Médecine',
  'Sport',
  'Métier extérieur',
  'Métier de bureau',
  'Commerce',
  'Artisanat',
  'Autre',
] as const

const MAILTO_WARNING_THRESHOLD = 40

function NewsletterView() {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [optInOnly, setOptInOnly] = useState(true)
  const [categories, setCategories] = useState<string[]>([])
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    apiFetch<{ clients: Client[] }>(getToken, '/api/clients')
      .then((data) => setState({ status: 'success', clients: data.clients }))
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

  function toggleCategorie(cat: string) {
    setCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]))
  }

  const matching = useMemo(() => {
    if (state.status !== 'success') return []
    return state.clients.filter((c) => {
      if (optInOnly && !c.newsletter) return false
      if (categories.length > 0 && !categories.includes(c.categorieMetier)) return false
      if (!c.email) return false
      return true
    })
  }, [state, optInOnly, categories])

  const selected = useMemo(() => matching.filter((c) => !excluded.has(c.id)), [matching, excluded])

  function toggleExcluded(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function copyEmails() {
    const emails = selected.map((c) => c.email).join(', ')
    try {
      await navigator.clipboard.writeText(emails)
      setCopyFeedback(`${selected.length} e-mail(s) copié(s).`)
    } catch {
      setCopyFeedback("Impossible de copier automatiquement — sélectionne le texte manuellement.")
    }
    setTimeout(() => setCopyFeedback(null), 4000)
  }

  const mailtoHref = useMemo(() => {
    const bcc = selected.map((c) => c.email).join(',')
    return `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }, [selected, subject, body])

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-border rounded-2xl p-5">
        <h3 className="font-serif text-lg font-semibold text-sage-dark mb-4">Ciblage des clientes</h3>

        <label className="flex items-center gap-2 text-sm mb-4">
          <input
            type="checkbox"
            checked={optInOnly}
            onChange={(e) => setOptInOnly(e.target.checked)}
            className="w-4 h-4"
          />
          Uniquement les clientes ayant accepté la newsletter
        </label>

        <div className="mb-2 text-xs font-semibold text-text-muted uppercase tracking-wide">
          Catégorie de métier (laisser vide = toutes)
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIE_METIER_VALUES.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategorie(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                categories.includes(cat)
                  ? 'bg-sage-dark text-white'
                  : 'bg-sage-pale text-sage-dark hover:bg-sage-light'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {state.status === 'loading' && <p className="text-sm text-text-muted">Chargement…</p>}
      {state.status === 'error' && <p className="text-sm text-danger">{state.message}</p>}

      {state.status === 'success' && (
        <div className="bg-white border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-lg font-semibold text-sage-dark">
              Destinataires — {selected.length} sélectionnée{selected.length > 1 ? 's' : ''}
            </h3>
          </div>
          {matching.length === 0 ? (
            <p className="text-sm text-text-muted">Aucune cliente ne correspond à ces critères.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
              {matching.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm py-1">
                  <input
                    type="checkbox"
                    checked={!excluded.has(c.id)}
                    onChange={() => toggleExcluded(c.id)}
                    className="w-4 h-4"
                  />
                  <span className="font-medium">{c.nomComplet}</span>
                  <span className="text-text-muted text-xs">{c.email}</span>
                  {c.categorieMetier && (
                    <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sage-light text-sage-dark">
                      {c.categorieMetier}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-border rounded-2xl p-5">
        <h3 className="font-serif text-lg font-semibold text-sage-dark mb-4">Composer le message</h3>
        <label className="block mb-3">
          <span className="block text-xs font-semibold text-text-muted mb-1">Sujet</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Ex : Offre du mois à l'institut Bella Luna"
            className="input"
          />
        </label>
        <label className="block mb-4">
          <span className="block text-xs font-semibold text-text-muted mb-1">Message</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Bonjour, profitez de notre offre du moment..."
            className="input resize-none"
          />
        </label>

        {selected.length > MAILTO_WARNING_THRESHOLD && (
          <p className="text-sm text-danger mb-3">
            {selected.length} destinataires sélectionnés — certaines applications mail peuvent tronquer les liens
            trop longs. Si « Ouvrir dans Mail » ne fonctionne pas, utilise plutôt « Copier les e-mails » et colle-les
            en copie cachée (Cci) manuellement.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={copyEmails}
            disabled={selected.length === 0}
            className="bg-white border border-border text-sage-dark px-4 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-pale disabled:opacity-50"
          >
            Copier les e-mails
          </button>
          <a
            href={mailtoHref}
            className={`bg-sage-dark text-white px-5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-dark/90 ${
              selected.length === 0 ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            Ouvrir dans Mail
          </a>
        </div>
        {copyFeedback && <p className="text-sm text-sage-dark mt-3">{copyFeedback}</p>}
      </div>
    </div>
  )
}

export default NewsletterView
