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
  minutesSupplementaires: number
  prestationCouleur: string | null
}

interface WeekGridAbsence {
  id: string
  libelle: string
  type: string
}

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
                  return (
                    <button
                      key={item.id}
                      onClick={() => onClickItem(item.id)}
                      className={`absolute left-0.5 right-0.5 rounded-md overflow-hidden text-left px-1 sm:px-1.5 transition-[filter] ${
                        isAnnule
                          ? 'bg-border text-text-muted hover:brightness-95'
                          : `text-white hover:brightness-95 ${item.prestationCouleur ? '' : avatarColorClass(item.prestationNom)}`
                      }`}
                      style={{ top, height, backgroundColor: !isAnnule && item.prestationCouleur ? item.prestationCouleur : undefined }}
                      title={`${item.clienteNom || 'Cliente inconnue'} — ${item.prestationNom || 'Prestation inconnue'}${isAnnule ? ' (Annulé)' : ''}`}
                    >
                      <span className={`block text-[9px] sm:text-[11px] font-semibold leading-tight truncate ${isAnnule ? 'line-through' : ''}`}>
                        {item.clienteNom || '?'}
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
