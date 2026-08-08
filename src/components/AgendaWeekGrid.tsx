import type { CSSProperties } from 'react'
import { avatarColorClass } from '../lib/avatarColor'
import { parseDureeMinutes, formatMinutes } from '../lib/duree'
import Icon from './Icon'

interface WeekGridItem {
  id: string
  date: string
  duree: string
  statut: string
  clienteNom: string
  prestationNom: string
  notes: string
  minutesSupplementaires: number
  prestationCouleur: string | null
  estPrive: boolean
}

interface WeekGridAbsence {
  id: string
  libelle: string
  type: string
  demiJournee: string | null
}

const HATCH_STYLE: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(35,51,45,0.06), rgba(35,51,45,0.06) 6px, transparent 6px, transparent 12px)',
}
const MIDI_HOUR = 13
const EN_ATTENTE_COULEUR = '#C9A86A'

export interface WeekGridColumn {
  key: string
  label: string
  dayNumber: number
  isToday: boolean
  items: WeekGridItem[]
  absences: WeekGridAbsence[]
}

interface AgendaWeekGridProps {
  columns: WeekGridColumn[]
  onClickItem: (id: string) => void
  onAddForColumn: (key: string) => void
}

const HOUR_HEIGHT = 48
const DEFAULT_START_HOUR = 8
const DEFAULT_END_HOUR = 20

const ABSENCE_DOT: Record<string, string> = {
  Vacances: 'bg-gold',
  'Jour off': 'bg-sage-dark',
  Autre: 'bg-danger',
}

function AgendaWeekGrid({ columns, onClickItem, onAddForColumn }: AgendaWeekGridProps) {
  const parsedColumns = columns.map((col) => ({
    ...col,
    items: col.items
      .map((item) => {
        const start = new Date(item.date)
        if (Number.isNaN(start.getTime())) return null
        const durationMin = parseDureeMinutes(item.duree) + item.minutesSupplementaires
        return { ...item, start, durationMin }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null),
  }))

  const allItems = parsedColumns.flatMap((c) => c.items)
  const earliestHour = allItems.length > 0 ? Math.min(...allItems.map((i) => i.start.getHours())) : DEFAULT_START_HOUR
  const latestHour =
    allItems.length > 0
      ? Math.max(...allItems.map((i) => Math.ceil((i.start.getTime() + i.durationMin * 60000) / 3600000)))
      : DEFAULT_END_HOUR
  const startHour = Math.min(DEFAULT_START_HOUR, earliestHour)
  const endHour = Math.max(DEFAULT_END_HOUR, Math.min(23, latestHour))
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i)
  const totalHeight = hours.length * HOUR_HEIGHT

  return (
    <div className="border border-border rounded-2xl bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <div className="flex min-w-[480px] sm:min-w-[700px] md:min-w-[860px]">
          <div className="w-9 sm:w-12 shrink-0 border-r border-border">
            <div className="h-14 sm:h-16 border-b border-border" />
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: HOUR_HEIGHT }}
                className="text-[9px] sm:text-xs text-text-muted pl-1 sm:pl-2 pt-0.5 border-t border-border/50"
              >
                {h}h
              </div>
            ))}
          </div>
          {parsedColumns.map((col) => (
            <div key={col.key} className="flex-1 min-w-[44px] sm:min-w-[80px] border-r border-border last:border-r-0">
              <div
                className={`h-14 sm:h-16 border-b border-border flex flex-col items-center justify-center gap-0.5 ${
                  col.isToday ? 'bg-sage-pale' : ''
                }`}
              >
                <button
                  onClick={() => onAddForColumn(col.key)}
                  className="flex flex-col items-center"
                  aria-label={`Ajouter un rendez-vous le ${col.label} ${col.dayNumber}`}
                >
                  <span
                    className={`text-[9px] sm:text-xs font-semibold uppercase ${col.isToday ? 'text-sage-dark' : 'text-text-muted'}`}
                  >
                    {col.label}
                  </span>
                  <span
                    className={`font-serif text-sm sm:text-base font-semibold ${col.isToday ? 'text-sage-dark' : 'text-text-dark'}`}
                  >
                    {col.dayNumber}
                  </span>
                </button>
                {col.absences.length > 0 && (
                  <div className="flex gap-0.5">
                    {col.absences.map((a) => (
                      <span
                        key={a.id}
                        title={a.libelle}
                        className={`w-1.5 h-1.5 rounded-full ${ABSENCE_DOT[a.type] ?? 'bg-sage-dark'}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="relative" style={{ height: totalHeight }}>
                {col.absences.map((a) => {
                  const midiTop = Math.max(0, (MIDI_HOUR - startHour) * HOUR_HEIGHT)
                  const top = a.demiJournee === 'apres-midi' ? midiTop : 0
                  const height = a.demiJournee === 'matin' ? midiTop : a.demiJournee === 'apres-midi' ? totalHeight - midiTop : totalHeight
                  return (
                    <div
                      key={a.id}
                      className="absolute left-0 right-0 pointer-events-none"
                      style={{ top, height, ...HATCH_STYLE }}
                      title={a.libelle}
                    />
                  )
                })}
                {hours.map((h, i) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-border/40"
                    style={{ top: i * HOUR_HEIGHT }}
                  />
                ))}
                {col.items.map((item) => {
                  const minutesFromStart = (item.start.getHours() - startHour) * 60 + item.start.getMinutes()
                  const top = (minutesFromStart / 60) * HOUR_HEIGHT
                  const height = Math.max(18, (item.durationMin / 60) * HOUR_HEIGHT - 2)
                  const isAnnule = item.statut === 'Annulé'
                  const isEnAttente = item.statut === 'En attente'
                  const displayNom = item.clienteNom || item.notes || '?'
                  const blockColor = isEnAttente ? EN_ATTENTE_COULEUR : item.prestationCouleur
                  return (
                    <button
                      key={item.id}
                      onClick={() => onClickItem(item.id)}
                      className={`absolute left-0.5 right-0.5 rounded-md overflow-hidden text-left px-1 sm:px-1.5 transition-[filter] ${
                        isAnnule
                          ? 'bg-border text-text-muted hover:brightness-95'
                          : `text-white hover:brightness-95 ${blockColor ? '' : avatarColorClass(item.prestationNom)}`
                      }`}
                      style={{ top, height, backgroundColor: !isAnnule && blockColor ? blockColor : undefined }}
                      title={`${displayNom} — ${item.prestationNom || 'Prestation inconnue'}${isAnnule ? ' (Annulé)' : isEnAttente ? ' (En attente)' : ''}`}
                    >
                      <span className={`block text-[9px] sm:text-[11px] font-semibold leading-tight truncate ${isAnnule ? 'line-through' : ''}`}>
                        {isEnAttente ? '? ' : ''}
                        {displayNom}
                      </span>
                      <span className="hidden sm:block text-[9px] opacity-90 leading-tight truncate">
                        {isAnnule ? 'Annulé' : item.prestationNom}
                      </span>
                      <span className="hidden sm:block text-[9px] opacity-80 leading-tight truncate">
                        {formatMinutes(item.durationMin)}
                      </span>
                      {isAnnule && (
                        <span className="absolute top-0 right-0.5">
                          <Icon name="x" size={8} />
                        </span>
                      )}
                      {item.estPrive && (
                        <span className="absolute top-0 left-0.5" title="Rendez-vous privé">
                          <Icon name="lock" size={8} />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default AgendaWeekGrid
