import { avatarColorClass } from '../lib/avatarColor'
import { parseDureeMinutes, formatMinutes } from '../lib/duree'
import RdvStatusPill from './RdvStatusPill'
import Icon from './Icon'

interface GridItem {
  id: string
  date: string
  duree: string
  statut: string
  clienteNom: string
  prestationNom: string
  prix: number | null
  minutesSupplementaires: number
  prestationCouleur: string | null
}

interface AgendaDayGridProps {
  items: GridItem[]
  onClickItem: (id: string) => void
  onSendReminder: (id: string) => void
}

const HOUR_HEIGHT = 64
const DEFAULT_START_HOUR = 8
const DEFAULT_END_HOUR = 20

function formatHeure(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function AgendaDayGrid({ items, onClickItem, onSendReminder }: AgendaDayGridProps) {
  const parsed = items
    .map((item) => {
      const start = new Date(item.date)
      if (Number.isNaN(start.getTime())) return null
      const durationMin = parseDureeMinutes(item.duree) + item.minutesSupplementaires
      const end = new Date(start.getTime() + durationMin * 60000)
      return { ...item, start, end, durationMin }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  const earliestHour = parsed.length > 0 ? Math.min(...parsed.map((i) => i.start.getHours())) : DEFAULT_START_HOUR
  const latestHour = parsed.length > 0 ? Math.max(...parsed.map((i) => Math.ceil(i.end.getTime() / 3600000))) : DEFAULT_END_HOUR
  const startHour = Math.min(DEFAULT_START_HOUR, earliestHour)
  const endHour = Math.max(DEFAULT_END_HOUR, Math.min(23, latestHour))
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i)
  const totalHeight = hours.length * HOUR_HEIGHT

  return (
    <div className="border border-border rounded-2xl bg-white overflow-hidden">
      <div className="flex">
        <div className="w-16 shrink-0 border-r border-border">
          {hours.map((h) => {
            const isMorning = h < 12
            const isZoneStart = h === startHour || h === 12
            return (
              <div
                key={h}
                style={{ height: HOUR_HEIGHT }}
                className={`text-xs text-text-muted px-2 pt-1 border-l-4 ${
                  isMorning ? 'border-l-gold bg-gold-pale/25' : 'border-l-avatar-teal bg-avatar-teal-pale/40'
                }`}
              >
                {isZoneStart && (
                  <div className={`text-[9px] font-bold uppercase tracking-wide mb-0.5 ${isMorning ? 'text-gold-text' : 'text-avatar-teal'}`}>
                    {isMorning ? 'Matin' : 'Après-midi'}
                  </div>
                )}
                {h}h
              </div>
            )
          })}
        </div>
        <div className="flex-1 relative" style={{ height: totalHeight }}>
          {hours.map((h, i) => (
            <div
              key={h}
              className={`absolute left-0 right-0 ${h === 12 ? 'border-b-2 border-dashed border-avatar-teal/40' : 'border-b border-border/60'}`}
              style={{ top: i * HOUR_HEIGHT }}
            />
          ))}
          {parsed.map((item) => {
            const minutesFromStart = (item.start.getHours() - startHour) * 60 + item.start.getMinutes()
            const top = (minutesFromStart / 60) * HOUR_HEIGHT
            const height = Math.max(30, (item.durationMin / 60) * HOUR_HEIGHT - 4)
            return (
              <div
                key={item.id}
                className={`absolute left-2 right-2 rounded-lg overflow-hidden ${
                  item.statut === 'Annulé' ? 'bg-border text-text-muted' : `text-white ${item.prestationCouleur ? '' : avatarColorClass(item.prestationNom)}`
                }`}
                style={{ top, height, backgroundColor: item.statut !== 'Annulé' && item.prestationCouleur ? item.prestationCouleur : undefined }}
              >
                <button onClick={() => onClickItem(item.id)} className="absolute inset-0 text-left px-3 py-1.5 hover:brightness-95 transition-[filter]">
                  <div className={`text-xs font-semibold truncate pr-16 ${item.statut === 'Annulé' ? 'line-through' : ''}`}>
                    {item.clienteNom || 'Cliente inconnue'}
                  </div>
                  <div className="text-[11px] opacity-90 truncate pr-16">
                    {item.statut === 'Annulé' ? 'Annulé' : item.prestationNom || 'Prestation inconnue'} · {formatHeure(item.start)}–{formatHeure(item.end)}
                    {' · '}
                    {formatMinutes(item.durationMin)}
                    {item.prix !== null ? ` · ${item.prix} €` : ''}
                  </div>
                </button>
                <div className="absolute top-1 right-1 flex items-center gap-1">
                  <RdvStatusPill statut={item.statut} compact />
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onSendReminder(item.id)
                    }}
                    className="w-5 h-5 flex items-center justify-center rounded-full bg-white/25 hover:bg-white/40 print:hidden"
                    aria-label={`Envoyer le rappel à ${item.clienteNom || 'la cliente'}`}
                    title="Envoyer le rappel"
                  >
                    <Icon name="send" size={10} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default AgendaDayGrid
