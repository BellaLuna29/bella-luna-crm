import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import RdvStatusPill from '../components/RdvStatusPill'
import RdvFormModal, { type RdvFormInitial } from '../components/RdvFormModal'
import AbsenceFormModal from '../components/AbsenceFormModal'
import MessageComposerModal from '../components/MessageComposerModal'
import { formatDateHeureNaturel } from '../lib/formatDate'
import type { TemplateContext } from '../lib/messageTemplates'

interface RdvItem {
  id: string
  date: string | null
  statut: string
  notes: string
  clienteId: string | null
  clienteNom: string
  prestationId: string | null
  prestationNom: string
  prix: number | null
}

interface Client {
  id: string
  telephone: string
  email: string
}

interface AbsenceItem {
  id: string
  libelle: string
  dateDebut: string | null
  dateFin: string | null
  type: string
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; items: RdvItem[] }

const ABSENCE_STYLES: Record<string, string> = {
  Vacances: 'bg-gold-pale text-gold-text',
  'Jour off': 'bg-sage-light text-sage-dark',
  Autre: 'bg-danger-pale text-danger',
}

const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function getMonday(d: Date): Date {
  const copy = startOfDay(d)
  const day = copy.getDay() // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  return copy
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function formatHeure(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function formatWeekRange(monday: Date): string {
  const sunday = addDays(monday, 6)
  const sameMonth = monday.getMonth() === sunday.getMonth()
  const startLabel = monday.toLocaleDateString('fr-FR', { day: 'numeric', month: sameMonth ? undefined : 'long' })
  const endLabel = sunday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  return `Semaine du ${startLabel} au ${endLabel}`
}

function toDateTimeLocal(date: Date, hour = 9): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:00`
}

function toDateTimeLocalFromIso(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function RdvCard({
  item,
  onClick,
  onSendReminder,
}: {
  item: RdvItem
  onClick: () => void
  onSendReminder: () => void
}) {
  return (
    <div className="w-full text-left bg-sage-pale hover:bg-sage-light transition-colors rounded-lg p-2.5 flex flex-col gap-1">
      <div className="flex items-start justify-between gap-1">
        <button onClick={onClick} className="flex-1 min-w-0 text-left">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-sage-dark">{formatHeure(item.date)}</span>
            <RdvStatusPill statut={item.statut} />
          </div>
          <div className="text-sm font-semibold truncate">{item.clienteNom || 'Cliente inconnue'}</div>
          <div className="text-xs text-text-muted truncate">
            {item.prestationNom || 'Prestation inconnue'}
            {item.prix !== null ? ` — ${item.prix} €` : ''}
          </div>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onSendReminder()
          }}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-white hover:bg-sage-light text-sage-dark text-xs print:hidden"
          aria-label={`Envoyer le rappel à ${item.clienteNom || 'la cliente'}`}
          title="Envoyer le rappel"
        >
          💬
        </button>
      </div>
    </div>
  )
}

function AgendaView() {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [absences, setAbsences] = useState<AbsenceItem[]>([])
  const [absenceModal, setAbsenceModal] = useState<{ initialDate?: string } | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [composer, setComposer] = useState<{ context: TemplateContext; telephone: string; email: string } | null>(
    null,
  )
  const [modal, setModal] = useState<
    | { mode: 'create'; initialValues?: Partial<RdvFormInitial> }
    | { mode: 'edit'; rdvId: string; initialValues: Partial<RdvFormInitial> }
    | null
  >(null)

  const load = useCallback(() => {
    setState({ status: 'loading' })
    apiFetch<{ rendezvous: RdvItem[] }>(getToken, '/api/rendezvous')
      .then((data) => setState({ status: 'success', items: data.rendezvous }))
      .catch((error: unknown) => {
        setState({
          status: 'error',
          message: error instanceof ApiError ? error.message : 'Erreur inconnue.',
        })
      })
  }, [getToken])

  const loadAbsences = useCallback(() => {
    apiFetch<{ absences: AbsenceItem[] }>(getToken, '/api/absences')
      .then((data) => setAbsences(data.absences))
      .catch(() => setAbsences([]))
  }, [getToken])

  useEffect(() => {
    load()
    loadAbsences()
    apiFetch<{ clients: Client[] }>(getToken, '/api/clients')
      .then((data) => setClients(data.clients))
      .catch(() => setClients([]))
  }, [load, loadAbsences, getToken])

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])

  function sendReminder(item: RdvItem) {
    const client = item.clienteId ? clientById.get(item.clienteId) : undefined
    setComposer({
      context: {
        nomComplet: item.clienteNom || 'cliente',
        date: formatDateHeureNaturel(item.date),
        prestation: item.prestationNom,
        montant: item.prix ?? undefined,
      },
      telephone: client?.telephone ?? '',
      email: client?.email ?? '',
    })
  }

  async function handleDeleteAbsence(id: string) {
    try {
      await apiFetch(getToken, `/api/absences?id=${id}`, { method: 'DELETE' })
      loadAbsences()
    } catch {
      // silent — best effort
    }
  }

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const today = useMemo(() => startOfDay(new Date()), [])

  const byDay = useMemo(() => {
    const map = new Map<string, RdvItem[]>()
    if (state.status !== 'success') return map
    for (const item of state.items) {
      if (!item.date) continue
      const d = new Date(item.date)
      if (Number.isNaN(d.getTime())) continue
      const key = dayKey(d)
      const arr = map.get(key) ?? []
      arr.push(item)
      map.set(key, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime())
    }
    return map
  }, [state])

  function absencesForDay(day: Date): AbsenceItem[] {
    const key = isoDate(day)
    return absences.filter((a) => a.dateDebut && a.dateFin && a.dateDebut <= key && key <= a.dateFin)
  }

  function jumpToDate(dateStr: string) {
    if (!dateStr) return
    const [y, m, d] = dateStr.split('-').map(Number)
    const picked = new Date(y, m - 1, d)
    if (Number.isNaN(picked.getTime())) return
    setWeekStart(getMonday(picked))
  }

  function openEdit(item: RdvItem) {
    setModal({
      mode: 'edit',
      rdvId: item.id,
      initialValues: {
        clienteId: item.clienteId ?? '',
        prestationId: item.prestationId ?? '',
        date: toDateTimeLocalFromIso(item.date),
        statut: item.statut,
        notes: item.notes,
      },
    })
  }

  function openCreate(forDay?: Date) {
    setModal({
      mode: 'create',
      initialValues: forDay ? { date: toDateTimeLocal(forDay) } : undefined,
    })
  }

  const currentAbsences = useMemo(
    () => absences.filter((a) => a.dateFin && a.dateFin >= isoDate(today)).slice(0, 6),
    [absences, today],
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="bg-white border border-border text-sage-dark w-9 h-9 rounded-[10px] text-sm font-semibold hover:bg-sage-pale"
            aria-label="Semaine précédente"
          >
            ←
          </button>
          <button
            onClick={() => setWeekStart(getMonday(new Date()))}
            className="bg-white border border-border text-sage-dark px-3 h-9 rounded-[10px] text-sm font-semibold hover:bg-sage-pale"
          >
            Aujourd'hui
          </button>
          <button
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="bg-white border border-border text-sage-dark w-9 h-9 rounded-[10px] text-sm font-semibold hover:bg-sage-pale"
            aria-label="Semaine suivante"
          >
            →
          </button>
          <input
            type="date"
            value={isoDate(weekStart)}
            onChange={(e) => jumpToDate(e.target.value)}
            className="input h-9 w-auto"
            aria-label="Aller à une date"
          />
          <span className="ml-1 font-serif text-base font-semibold text-sage-dark">
            {formatWeekRange(weekStart)}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setAbsenceModal({ initialDate: isoDate(weekStart) })}
            className="bg-white border border-border text-sage-dark px-4 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-pale"
          >
            Poser une absence
          </button>
          <button
            onClick={() => window.print()}
            className="bg-white border border-border text-sage-dark px-4 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-pale"
          >
            Exporter en PDF
          </button>
          <button
            onClick={() => openCreate()}
            className="bg-sage-dark text-white px-4.5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-dark/90"
          >
            Nouveau rendez-vous
          </button>
        </div>
      </div>

      {currentAbsences.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 print:hidden">
          {currentAbsences.map((a) => (
            <span
              key={a.id}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${ABSENCE_STYLES[a.type] ?? 'bg-sage-light text-sage-dark'}`}
            >
              {a.libelle} ({a.dateDebut} → {a.dateFin})
              <button
                onClick={() => handleDeleteAbsence(a.id)}
                className="hover:opacity-70"
                aria-label={`Supprimer l'absence ${a.libelle}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {state.status === 'loading' && <p className="text-sm text-text-muted">Chargement…</p>}
      {state.status === 'error' && <p className="text-sm text-danger">{state.message}</p>}

      {state.status === 'success' && (
        <div className="overflow-x-auto pb-2 print:overflow-visible">
          <div className="grid grid-cols-7 gap-3 min-w-[980px] print:min-w-0 print:gap-1.5">
            {days.map((day, i) => {
              const isToday = dayKey(day) === dayKey(today)
              const items = byDay.get(dayKey(day)) ?? []
              const dayAbsences = absencesForDay(day)
              return (
                <div
                  key={dayKey(day)}
                  className={`bg-white border rounded-2xl p-2.5 min-h-[220px] flex flex-col gap-2 ${
                    isToday ? 'border-sage-dark border-2' : 'border-border'
                  }`}
                >
                  <div className="flex items-center justify-between px-0.5">
                    <div>
                      <div className={`text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-sage-dark' : 'text-text-muted'}`}>
                        {DAY_LABELS[i]}
                      </div>
                      <div className="font-serif text-lg font-semibold">{day.getDate()}</div>
                    </div>
                    <button
                      onClick={() => openCreate(day)}
                      className="text-sage-dark hover:bg-sage-pale rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold print:hidden"
                      aria-label={`Ajouter un rendez-vous le ${day.toLocaleDateString('fr-FR')}`}
                    >
                      +
                    </button>
                  </div>

                  {dayAbsences.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {dayAbsences.map((a) => (
                        <span
                          key={a.id}
                          className={`text-[11px] font-semibold px-2 py-1 rounded-md ${ABSENCE_STYLES[a.type] ?? 'bg-sage-light text-sage-dark'}`}
                        >
                          {a.type === 'Vacances' ? '🌴 ' : ''}
                          {a.libelle}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5 flex-1">
                    {items.length === 0 ? (
                      <p className="text-xs text-text-muted px-0.5">Aucun RDV</p>
                    ) : (
                      items.map((item) => (
                        <RdvCard
                          key={item.id}
                          item={item}
                          onClick={() => openEdit(item)}
                          onSendReminder={() => sendReminder(item)}
                        />
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {modal && (
        <RdvFormModal
          mode={modal.mode}
          rdvId={modal.mode === 'edit' ? modal.rdvId : undefined}
          initialValues={modal.initialValues}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            load()
          }}
        />
      )}

      {absenceModal && (
        <AbsenceFormModal
          initialDate={absenceModal.initialDate}
          onClose={() => setAbsenceModal(null)}
          onSaved={() => {
            setAbsenceModal(null)
            loadAbsences()
          }}
        />
      )}

      {composer && (
        <MessageComposerModal
          context={composer.context}
          telephone={composer.telephone}
          email={composer.email}
          initialTemplateKey="rappel"
          onClose={() => setComposer(null)}
        />
      )}
    </div>
  )
}

export default AgendaView
