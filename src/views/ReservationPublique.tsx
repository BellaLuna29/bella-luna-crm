import { useEffect, useMemo, useState } from 'react'
import logo from '../assets/logo.png'

interface PublicPrestation {
  id: string
  nom: string
  categorie: string
  prix: number
  duree: string
}

const RAISON_MESSAGES: Record<string, string> = {
  jour_inactif: "Bella Luna ne propose pas de rendez-vous ce jour de la semaine — essaie un autre jour.",
  absence: 'Bella Luna est absente à cette date — essaie un autre jour.',
  complet: 'Complet ce jour-là — essaie une autre date.',
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined

function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function maxDateIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function ReservationPublique() {
  const [prestations, setPrestations] = useState<PublicPrestation[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [prestationId, setPrestationId] = useState('')
  const [date, setDate] = useState('')
  const [creneaux, setCreneaux] = useState<string[] | null>(null)
  const [raisonVide, setRaisonVide] = useState<string | null>(null)
  const [loadingCreneaux, setLoadingCreneaux] = useState(false)
  const [heure, setHeure] = useState('')
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [email, setEmail] = useState('')
  const [site, setSite] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!BASE_URL) {
      setLoadError('Configuration manquante.')
      return
    }
    fetch(`${BASE_URL}/api/prestations?resource=public-prestations`)
      .then((r) => r.json())
      .then((data) => setPrestations(data.prestations ?? []))
      .catch(() => setLoadError('Impossible de charger les prestations. Réessaie dans un instant.'))
  }, [])

  useEffect(() => {
    setHeure('')
    setCreneaux(null)
    setRaisonVide(null)
    if (!prestationId || !date || !BASE_URL) return
    setLoadingCreneaux(true)
    fetch(`${BASE_URL}/api/prestations?resource=public-disponibilites&date=${date}&prestationId=${prestationId}`)
      .then((r) => r.json())
      .then((data) => {
        setCreneaux(data.creneaux ?? [])
        setRaisonVide(data.raison ?? null)
      })
      .catch(() => {
        setCreneaux([])
        setRaisonVide(null)
      })
      .finally(() => setLoadingCreneaux(false))
  }, [prestationId, date])

  const prestationsParCategorie = useMemo(() => {
    if (!prestations) return []
    const map = new Map<string, PublicPrestation[]>()
    for (const p of prestations) {
      const list = map.get(p.categorie) ?? []
      list.push(p)
      map.set(p.categorie, list)
    }
    return Array.from(map.entries())
  }, [prestations])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    if (!prestationId || !date || !heure) {
      setSubmitError('Choisis une prestation, une date et un horaire.')
      return
    }
    if (!nom.trim()) {
      setSubmitError('Ton nom est obligatoire.')
      return
    }
    if (!telephone.trim() && !email.trim()) {
      setSubmitError('Indique un téléphone ou un e-mail pour être recontactée.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`${BASE_URL}/api/prestations?resource=public-booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prestationId,
          date,
          heure,
          nom: nom.trim(),
          telephone: telephone.trim(),
          email: email.trim(),
          site,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSubmitError(data.error ?? 'Une erreur est survenue, réessaie.')
        return
      }
      setDone(true)
    } catch {
      setSubmitError('Une erreur est survenue, réessaie.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-sage-pale flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <img src={logo} alt="Bella Luna" className="w-20 h-20 mx-auto mb-3 object-contain" />
          <h1 className="font-serif text-2xl font-semibold text-sage-dark">Bella Luna</h1>
          <p className="text-sm text-text-muted mt-1">Prendre rendez-vous</p>
        </div>

        <div className="bg-white border border-border rounded-2xl p-6">
          {loadError && <p className="text-sm text-danger">{loadError}</p>}

          {!loadError && done && (
            <div className="text-center py-6">
              <p className="font-serif text-lg font-semibold text-sage-dark mb-2">Demande envoyée</p>
              <p className="text-sm text-text-muted">
                Vous serez notifiée par mail ou SMS si le rendez-vous est accepté.
              </p>
            </div>
          )}

          {!loadError && !done && !prestations && <p className="text-sm text-text-muted">Chargement…</p>}

          {!loadError && !done && prestations && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="block">
                <span className="block text-xs font-semibold text-text-muted mb-1">Prestation *</span>
                <select
                  value={prestationId}
                  onChange={(e) => setPrestationId(e.target.value)}
                  className="input"
                  required
                >
                  <option value="">Choisir…</option>
                  {prestationsParCategorie.map(([categorie, items]) => (
                    <optgroup key={categorie || 'Autre'} label={categorie || 'Autre'}>
                      {items.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nom} ({p.duree})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-text-muted mb-1">Date *</span>
                <input
                  type="date"
                  value={date}
                  min={todayIso()}
                  max={maxDateIso()}
                  onChange={(e) => setDate(e.target.value)}
                  className="input"
                  required
                  disabled={!prestationId}
                />
              </label>

              {prestationId && date && (
                <div>
                  <span className="block text-xs font-semibold text-text-muted mb-1">Horaire *</span>
                  {loadingCreneaux && <p className="text-sm text-text-muted">Recherche des créneaux…</p>}
                  {!loadingCreneaux && creneaux && creneaux.length === 0 && (
                    <p className="text-sm text-text-muted">
                      {(raisonVide && RAISON_MESSAGES[raisonVide]) || 'Aucun créneau disponible ce jour-là.'}
                    </p>
                  )}
                  {!loadingCreneaux && creneaux && creneaux.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {creneaux.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setHeure(c)}
                          className={`px-2 py-2 rounded-[8px] text-sm font-semibold border ${
                            heure === c
                              ? 'bg-sage-dark text-white border-sage-dark'
                              : 'bg-white text-sage-dark border-border hover:bg-sage-pale'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <label className="block">
                <span className="block text-xs font-semibold text-text-muted mb-1">Ton nom *</span>
                <input
                  type="text"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  maxLength={200}
                  className="input"
                  required
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-semibold text-text-muted mb-1">Téléphone</span>
                  <input
                    type="tel"
                    value={telephone}
                    onChange={(e) => setTelephone(e.target.value)}
                    maxLength={30}
                    className="input"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-text-muted mb-1">E-mail</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
                </label>
              </div>
              <p className="text-[11px] text-text-muted -mt-2">Un des deux au moins, pour te recontacter.</p>

              {/* Honeypot — hidden from real visitors, bots tend to fill every field */}
              <input
                type="text"
                value={site}
                onChange={(e) => setSite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                className="absolute -left-[9999px] w-px h-px opacity-0"
                aria-hidden="true"
              />

              {submitError && <p className="text-sm text-danger">{submitError}</p>}

              <button
                type="submit"
                disabled={submitting || !heure}
                className="bg-sage-dark text-white px-5 py-2.5 rounded-[10px] text-sm font-semibold disabled:opacity-50"
              >
                {submitting ? 'Envoi…' : 'Demander ce rendez-vous'}
              </button>
              <p className="text-[11px] text-text-muted text-center">
                Cette demande n'est pas encore confirmée — Bella Luna la validera avant de la fixer définitivement.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default ReservationPublique
