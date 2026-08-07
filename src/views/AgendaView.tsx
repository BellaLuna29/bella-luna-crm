import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import AgendaDayGrid from '../components/AgendaDayGrid'
import AgendaWeekGrid, { type WeekGridColumn } from '../components/AgendaWeekGrid'
import Icon from '../components/Icon'
import RdvFormModal, { type RdvFormInitial } from '../components/RdvFormModal'
import AbsenceFormModal from '../components/AbsenceFormModal'
import MessageComposerModal from '../components/MessageComposerModal'
import { formatDateHeureNaturel } from '../lib/formatDate'
import type { TemplateContext } from '../lib/templateEngine'

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
  duree: string
  serieId: string | null
  minutesSupplementaires: number
  prestationCouleur: string | null
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
  demiJournee: string | null
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

const VIEW_MODE_KEY = 'bella-luna-agenda-view-mode'

function initialViewMode(): 'semaine' | 'jour' {
  const stored = localStorage.getItem(VIEW_MODE_KEY)
  if (stored === 'semaine' || stored === 'jour') return stored
  return window.matchMedia('(max-width: 640px)').matches ? 'jour' : 'semaine'
}

function AgendaView() {
  const { getToken } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [viewMode, setViewModeState] = useState<'semaine' | 'jour'>(initialViewMode)
  function setViewMode(next: 'semaine' | 'jour') {
    localStorage.setItem(VIEW_MODE_KEY, next)
    setViewModeState(next)
  }
  const [focusDate, setFocusDate] = useState(() => startOfDay(new Date()))
  const weekStart = useMemo(() => getMonday(focusDate), [focusDate])
  const [absences, setAbsences] = useState<AbsenceItem[]>([])
  const [absenceModal, setAbsenceModal] = useState<{ initialDate?: string } | null>(null)
  const [absenceError, setAbsenceError] = useState<string | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [prestationsLegend, setPrestationsLegend] = useState<{ id: string; nom: string; couleur: string | null }[]>([])
  const [showLegend, setShowLegend] = useState(false)
  const [composer, setComposer] = useState<{ context: TemplateContext; telephone: string; email: string } | null>(
    null,
  )
  const [modal, setModal] = useState<
    | { mode: 'create'; initialValues?: Partial<RdvFormInitial> }
    | { mode: 'edit'; rdvId: string; initialValues: Partial<RdvFormInitial>; seriesSiblingIds: string[] }
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
    apiFetch<{ prestations: { id: string; nom: string; couleur: string | null }[] }>(getToken, '/api/prestations')
      .then((data) => setPrestationsLegend(data.prestations.filter((p) => p.couleur)))
      .catch(() => setPrestationsLegend([]))
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
    setAbsenceError(null)
    try {
      await apiFetch(getToken, `/api/absences?id=${id}`, { method: 'DELETE' })
      loadAbsences()
    } catch (err) {
      setAbsenceError(err instanceof ApiError ? err.message : "Impossible de supprimer l'absence.")
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
    setFocusDate(startOfDay(picked))
  }

  function openEdit(item: RdvItem) {
    const seriesSiblingIds =
      state.status === 'success' && item.serieId
        ? state.items
            .filter((i) => i.serieId === item.serieId && i.id !== item.id && i.statut === 'Confirmé')
            .map((i) => i.id)
        : []
    setModal({
      mode: 'edit',
      rdvId: item.id,
      initialValues: {
        clienteId: item.clienteId ?? '',
        prestationId: item.prestationId ?? '',
        date: toDateTimeLocalFromIso(item.date),
        statut: item.statut,
        notes: item.notes,
        minutesSupplementaires: String(item.minutesSupplementaires),
      },
      seriesSiblingIds,
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

  const weekColumns: WeekGridColumn[] = useMemo(
    () =>
      days.map((day, i) => {
        const key = isoDate(day)
        return {
          key: dayKey(day),
          label: DAY_LABELS[i].slice(0, 3),
          dayNumber: day.getDate(),
          isToday: dayKey(day) === dayKey(today),
          items: (byDay.get(dayKey(day)) ?? [])
            .filter((item): item is RdvItem & { date: string } => item.date !== null)
            .map((item) => ({
              id: item.id,
              date: item.date,
              duree: item.duree,
              statut: item.statut,
              clienteNom: item.clienteNom,
              prestationNom: item.prestationNom,
              notes: item.notes,
              minutesSupplementaires: item.minutesSupplementaires,
              prestationCouleur: item.prestationCouleur,
            })),
          absences: absences
            .filter((a) => a.dateDebut && a.dateFin && a.dateDebut <= key && key <= a.dateFin)
            .map((a) => ({ id: a.id, libelle: a.libelle, type: a.type, demiJournee: a.demiJournee })),
        }
      }),
    [days, byDay, today, absences],
  )

  function handleClickWeekItem(id: string) {
    if (state.status !== 'success') return
    const item = state.items.find((i) => i.id === id)
    if (item) openEdit(item)
  }

  function handleAddForColumn(key: string) {
    const day = days.find((d) => dayKey(d) === key)
    if (day) openCreate(day)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-white border border-border rounded-[10px] p-0.5">
            <button
              onClick={() => setViewMode('semaine')}
              className={`px-3 h-8 rounded-[8px] text-sm font-semibold ${
                viewMode === 'semaine' ? 'bg-sage-dark text-white' : 'text-text-muted hover:bg-sage-pale'
              }`}
            >
              Semaine
            </button>
            <button
              onClick={() => setViewMode('jour')}
              className={`px-3 h-8 rounded-[8px] text-sm font-semibold ${
                viewMode === 'jour' ? 'bg-sage-dark text-white' : 'text-text-muted hover:bg-sage-pale'
              }`}
            >
              Jour
            </button>
          </div>
          <button
            onClick={() => setFocusDate((d) => addDays(d, viewMode === 'jour' ? -1 : -7))}
            className="bg-white border border-border text-sage-dark w-9 h-9 rounded-[10px] text-sm font-semibold hover:bg-sage-pale"
            aria-label={viewMode === 'jour' ? 'Jour précédent' : 'Semaine précédente'}
          >
            ←
          </button>
          <button
            onClick={() => setFocusDate(startOfDay(new Date()))}
            className="bg-white border border-border text-sage-dark px-3 h-9 rounded-[10px] text-sm font-semibold hover:bg-sage-pale"
          >
            Aujourd'hui
          </button>
          <button
            onClick={() => setFocusDate((d) => addDays(d, viewMode === 'jour' ? 1 : 7))}
            className="bg-white border border-border text-sage-dark w-9 h-9 rounded-[10px] text-sm font-semibold hover:bg-sage-pale"
            aria-label={viewMode === 'jour' ? 'Jour suivant' : 'Semaine suivante'}
          >
            →
          </button>
          <input
            type="date"
            value={isoDate(focusDate)}
            onChange={(e) => jumpToDate(e.target.value)}
            className="input h-9 max-w-40"
            aria-label="Aller à une date"
          />
          <span className="ml-1 font-serif text-base font-semibold text-sage-dark">
            {viewMode === 'jour'
              ? focusDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
              : formatWeekRange(weekStart)}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setAbsenceModal({ initialDate: isoDate(focusDate) })}
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
          {prestationsLegend.length > 0 && (
            <button
              onClick={() => setShowLegend((v) => !v)}
              className="bg-white border border-border text-sage-dark px-4 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-pale"
            >
              Légende des couleurs
            </button>
          )}
          <button
            onClick={() => openCreate()}
            className="bg-sage-dark text-white px-4.5 py-2.5 rounded-[10px] text-sm font-semibold hover:bg-sage-dark/90"
          >
            Nouveau rendez-vous
          </button>
        </div>
      </div>

      {showLegend && prestationsLegend.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4 print:hidden">
          {prestationsLegend.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1.5 text-xs text-text-muted">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.couleur ?? undefined }} />
              {p.nom}
            </span>
          ))}
        </div>
      )}

      {absenceError && <p className="text-sm text-danger mb-3 print:hidden">{absenceError}</p>}

      {currentAbsences.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 print:hidden">
          {currentAbsences.map((a) => (
            <span
              key={a.id}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${ABSENCE_STYLES[a.type] ?? 'bg-sage-light text-sage-dark'}`}
            >
              {a.libelle}
              {a.demiJournee === 'matin' ? ' — Matin' : a.demiJournee === 'apres-midi' ? ' — Après-midi' : ''} (
              {a.dateDebut} → {a.dateFin})
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

      {state.status === 'success' && viewMode === 'jour' && (
        <div className="bg-white border border-border rounded-2xl p-5 max-w-3xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-lg font-semibold text-sage-dark capitalize">
              {focusDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            <button
              onClick={() => openCreate(focusDate)}
              className="bg-sage-dark text-white w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold print:hidden"
              aria-label={`Ajouter un rendez-vous le ${focusDate.toLocaleDateString('fr-FR')}`}
            >
              +
            </button>
          </div>

          {absencesForDay(focusDate).length > 0 && (
            <div className="flex flex-col gap-2 mb-4">
              {absencesForDay(focusDate).map((a) => (
                <span
                  key={a.id}
                  className={`text-sm font-semibold px-3 py-2 rounded-lg inline-flex items-center gap-1.5 ${ABSENCE_STYLES[a.type] ?? 'bg-sage-light text-sage-dark'}`}
                >
                  {a.type === 'Vacances' && <Icon name="sun" size={14} />}
                  {a.libelle}
                  {a.demiJournee === 'matin' ? ' — Matin' : a.demiJournee === 'apres-midi' ? ' — Après-midi' : ''}
                </span>
              ))}
            </div>
          )}

          {(byDay.get(dayKey(focusDate)) ?? []).length === 0 && absencesForDay(focusDate).length === 0 ? (
            <p className="text-sm text-text-muted">Aucun rendez-vous ce jour-là.</p>
          ) : (
            <AgendaDayGrid
              items={(byDay.get(dayKey(focusDate)) ?? [])
                .filter((item): item is RdvItem & { date: string } => item.date !== null)
                .map((item) => ({
                  id: item.id,
                  date: item.date,
                  duree: item.duree,
                  statut: item.statut,
                  clienteNom: item.clienteNom,
                  prestationNom: item.prestationNom,
                  notes: item.notes,
                  prix: item.prix,
                  minutesSupplementaires: item.minutesSupplementaires,
                  prestationCouleur: item.prestationCouleur,
                }))}
              absences={absencesForDay(focusDate).map((a) => ({ id: a.id, libelle: a.libelle, demiJournee: a.demiJournee }))}
              onClickItem={(id) => {
                const item = state.items.find((i) => i.id === id)
                if (item) openEdit(item)
              }}
              onSendReminder={(id) => {
                const item = state.items.find((i) => i.id === id)
                if (item) sendReminder(item)
              }}
            />
          )}
        </div>
      )}

      {state.status === 'success' && viewMode === 'semaine' && (
        <div className="print:overflow-visible">
          <AgendaWeekGrid columns={weekColumns} onClickItem={handleClickWeekItem} onAddForColumn={handleAddForColumn} />
        </div>
      )}

      {modal && (
        <RdvFormModal
          mode={modal.mode}
          rdvId={modal.mode === 'edit' ? modal.rdvId : undefined}
          initialValues={modal.initialValues}
          seriesSiblingIds={modal.mode === 'edit' ? modal.seriesSiblingIds : undefined}
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
