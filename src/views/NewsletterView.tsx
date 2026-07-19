import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import { NEWSLETTER_TEMPLATES } from '../lib/newsletterTemplates'
import { recordNewsletterSent } from '../lib/newsletterStatus'

interface Client {
  id: string
  nomComplet: string
  email: string
  genre: string
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
  const [genreFilter, setGenreFilter] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [showAllRecipients, setShowAllRecipients] = useState(false)
  const [templateKey, setTemplateKey] = useState(NEWSLETTER_TEMPLATES[0].key)
  const [subject, setSubject] = useState(NEWSLETTER_TEMPLATES[0].subject)
  const [body, setBody] = useState(NEWSLETTER_TEMPLATES[0].body)
  const [copyFeedback, setCopyFeedback] = useState<{ message: string; isError: boolean } | null>(null)

  function handleTemplateChange(key: string) {
    setTemplateKey(key)
    const t = NEWSLETTER_TEMPLATES.find((tpl) => tpl.key === key)
    if (t) {
      setSubject(t.subject)
      setBody(t.body)
    }
  }

  function handleNewsletterSent() {
    recordNewsletterSent(getToken).catch(() => {
      // best effort — la date de dernier envoi ne sera juste pas mise à jour
    })
  }

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
      if (genreFilter && c.genre !== genreFilter) return false
      if (categories.length > 0 && !categories.includes(c.categorieMetier)) return false
      if (!c.email) return false
      return true
    })
  }, [state, optInOnly, genreFilter, categories])

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
      setCopyFeedback({ message: `${selected.length} e-mail(s) copié(s).`, isError: false })
    } catch {
      setCopyFeedback({
        message: 'Impossible de copier automatiquement — sélectionne le texte manuellement.',
        isError: true,
      })
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

        <div className="mb-2 text-xs font-semibold text-text-muted uppercase tracking-wide">Genre</div>
        <div className="flex flex-wrap gap-2 mb-4">
          {['', 'Femme', 'Homme'].map((g) => (
            <button
              key={g || '_all'}
              onClick={() => setGenreFilter(g)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                genreFilter === g
                  ? 'bg-sage-dark text-white'
                  : 'bg-sage-pale text-sage-dark hover:bg-sage-light'
              }`}
            >
              {g || 'Tous'}
            </button>
          ))}
        </div>

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
            <>
              <div className={`flex flex-col gap-1 ${showAllRecipients ? 'max-h-64 overflow-y-auto' : ''}`}>
                {(showAllRecipients ? matching : matching.slice(0, 5)).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm py-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={!excluded.has(c.id)}
                      onChange={() => toggleExcluded(c.id)}
                      className="w-4 h-4 shrink-0"
                    />
                    <span className="font-medium truncate">{c.nomComplet}</span>
                    <span className="text-text-muted text-xs truncate min-w-0">{c.email}</span>
                    {c.genre && (
                      <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gold-pale text-gold-text">
                        {c.genre === 'Homme' ? 'H' : 'F'}
                      </span>
                    )}
                    {c.categorieMetier && (
                      <span className="ml-auto shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sage-light text-sage-dark">
                        {c.categorieMetier}
                      </span>
                    )}
                  </label>
                ))}
              </div>
              {matching.length > 5 && (
                <button
                  onClick={() => setShowAllRecipients((v) => !v)}
                  className="mt-2 text-xs font-semibold text-sage-dark hover:underline"
                >
                  {showAllRecipients ? 'Réduire' : `Voir les ${matching.length - 5} autres`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div className="bg-white border border-border rounded-2xl p-5">
        <h3 className="font-serif text-lg font-semibold text-sage-dark mb-4">Composer le message</h3>
        <label className="block mb-3">
          <span className="block text-xs font-semibold text-text-muted mb-1">Modèle prédéfini</span>
          <select value={templateKey} onChange={(e) => handleTemplateChange(e.target.value)} className="input">
            {NEWSLETTER_TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
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
            onClick={handleNewsletterSent}
            className={`bg-sage-dark text-white px-5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-dark/90 ${
              selected.length === 0 ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            Ouvrir dans Mail
          </a>
        </div>
        {copyFeedback && (
          <p className={`text-sm mt-3 ${copyFeedback.isError ? 'text-danger' : 'text-sage-dark'}`}>
            {copyFeedback.message}
          </p>
        )}
      </div>
    </div>
  )
}

export default NewsletterView
