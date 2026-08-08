import type { CSSProperties } from 'react'
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
  notes: string
  prix: number | null
  minutesSupplementaires: number
  prestationCouleur: string | null
  estPrive: boolean
}

interface DayGridAbsence {
  id: string
  libelle: string
  demiJournee: string | null
}

interface AgendaDayGridProps {
  items: GridItem[]
  absences?: DayGridAbsence[]
  onClickItem: (id: string) => void
  onSendReminder: (id: string) => void
}

const HOUR_HEIGHT = 64
const DEFAULT_START_HOUR = 8
const DEFAULT_END_HOUR = 20
const MIDI_HOUR = 12
const EN_ATTENTE_COULEUR = '#C9A86A'
const HATCH_STYLE: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(35,51,45,0.06), rgba(35,51,45,0.06) 6px, transparent 6px, transparent 12px)',
}

function formatHeure(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function AgendaDayGrid({ items, absences = [], onClickItem, onSendReminder }: AgendaDayGridProps) {
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
          {absences.map((a) => {
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
              className={`absolute left-0 right-0 ${h === 12 ? 'border-b-2 border-dashed border-avatar-teal/40' : 'border-b border-border/60'}`}
              style={{ top: i * HOUR_HEIGHT }}
            />
          ))}
          {parsed.map((item) => {
            const minutesFromStart = (item.start.getHours() - startHour) * 60 + item.start.getMinutes()
            const top = (minutesFromStart / 60) * HOUR_HEIGHT
            const height = Math.max(30, (item.durationMin / 60) * HOUR_HEIGHT - 4)
            const isAnnule = item.statut === 'Annulé'
            const isEnAttente = item.statut === 'En attente'
            const displayNom = item.clienteNom || item.notes || 'Cliente inconnue'
            const blockColor = isEnAttente ? EN_ATTENTE_COULEUR : item.prestationCouleur
            return (
              <div
                key={item.id}
                className={`absolute left-2 right-2 rounded-lg overflow-hidden ${
                  isAnnule ? 'bg-border text-text-muted' : `text-white ${blockColor ? '' : avatarColorClass(item.prestationNom)}`
                }`}
                style={{ top, height, backgroundColor: !isAnnule && blockColor ? blockColor : undefined }}
              >
                <button onClick={() => onClickItem(item.id)} className="absolute inset-0 text-left px-3 py-1.5 hover:brightness-95 transition-[filter]">
                  <div className={`text-xs font-semibold truncate pr-16 ${isAnnule ? 'line-through' : ''}`}>
                    {isEnAttente ? '? ' : ''}
                    {displayNom}
                  </div>
                  <div className="text-[11px] opacity-90 truncate pr-16">
                    {isAnnule ? 'Annulé' : item.prestationNom || 'Prestation inconnue'} · {formatHeure(item.start)}–{formatHeure(item.end)}
                    {' · '}
                    {formatMinutes(item.durationMin)}
                    {item.prix !== null ? ` · ${item.prix} €` : ''}
                  </div>
                </button>
                <div className="absolute top-1 right-1 flex items-center gap-1">
                  {item.estPrive && (
                    <span title="Rendez-vous privé" className="opacity-90">
                      <Icon name="lock" size={11} />
                    </span>
                  )}
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
