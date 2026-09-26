import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import { useToast } from './ToastProvider'
import Modal from './Modal'
import Icon from './Icon'
import { parseDureeMinutes } from '../lib/duree'

interface Disponibilite { jourSemaine: number; actif: boolean; heureDebut: string; heureFin: string }
interface Absence {
  dateDebut: string | null; dateFin: string | null; demiJournee: string | null
  heureDebut: string | null; heureFin: string | null; recurrence: string | null; jourSemaine: number | null
}
interface RendezVous {
  date: string | null
  statut: string
  duree: string
  minutesSupplementaires: number
}
interface DisponibilitesExportModalProps { onClose: () => void }

type ExportFormat = 'mois' | 'semaine'
type StatutJour = 'off' | 'matin' | 'apres-midi' | 'journee'
type SurchargesDisponibilite = Record<string, StatutJour>

const JOURS_COURTS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const COULEURS: Record<StatutJour, string> = { off: '#C8C3BB', matin: '#FFE054', 'apres-midi': '#F4A11B', journee: '#78D649' }

function minutes(value: string | null): number | null {
  if (!value) return null
  const [hour, minute] = value.slice(0, 5).split(':').map(Number)
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function mondayOf(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = copy.getDay()
  copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day))
  return copy
}

function addDays(date: Date, count: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + count)
  return copy
}

function applies(absence: Absence, date: Date): boolean {
  if (absence.recurrence === 'hebdomadaire') return absence.jourSemaine === date.getDay()
  const key = dateKey(date)
  return Boolean(absence.dateDebut && absence.dateFin && absence.dateDebut <= key && key <= absence.dateFin)
}

function parisDateKey(date: Date): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(date)
}

function parisMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

function hasFreeTime(start: number, end: number, occupations: { start: number; end: number }[]): boolean {
  for (let cursor = start; cursor + 30 <= end; cursor += 30) {
    if (!occupations.some((block) => cursor < block.end && cursor + 30 > block.start)) return true
  }
  return false
}

function getStatus(
  date: Date,
  disponibilites: Map<number, Disponibilite>,
  absences: Absence[],
  rendezvous: RendezVous[],
): { status: StatutJour; label: string } {
  const dispo = disponibilites.get(date.getDay())
  const aucunJourConfigure = [...disponibilites.values()].every((item) => !item.actif)
  const rendezvousDuJour = rendezvous.filter((item) => {
    if (!item.date || item.statut === 'Annulé') return false
    const instant = new Date(item.date)
    return !Number.isNaN(instant.getTime()) && parisDateKey(instant) === dateKey(date)
  })
  if (!dispo?.actif && !aucunJourConfigure) return { status: 'off', label: 'COMPLET' }
  if (aucunJourConfigure && date.getDay() === 0 && rendezvousDuJour.length === 0) return { status: 'off', label: 'COMPLET' }

  let start = minutes(dispo?.heureDebut ?? null) ?? 9 * 60
  let end = minutes(dispo?.heureFin ?? null) ?? 18 * 60
  const occupations: { start: number; end: number }[] = []

  for (const absence of absences.filter((item) => applies(item, date))) {
    if (!absence.demiJournee && !absence.heureDebut && !absence.heureFin) return { status: 'off', label: 'COMPLET' }
    if (absence.demiJournee === 'matin') { start = Math.max(start, 13 * 60); continue }
    if (absence.demiJournee === 'apres-midi') { end = Math.min(end, 13 * 60); continue }
    const absenceStart = minutes(absence.heureDebut)
    const absenceEnd = minutes(absence.heureFin)
    if (absenceStart !== null && absenceEnd !== null && absenceStart < end && absenceEnd > start) {
      if (absenceStart <= start && absenceEnd >= end) return { status: 'off', label: 'COMPLET' }
      occupations.push({ start: absenceStart, end: absenceEnd })
    }
  }

  if (start >= end) return { status: 'off', label: 'COMPLET' }
  for (const item of rendezvousDuJour) {
    const instant = new Date(item.date as string)
    const itemStart = parisMinutes(instant)
    const duration = parseDureeMinutes(item.duree) + item.minutesSupplementaires
    if (duration > 0) occupations.push({ start: itemStart, end: itemStart + duration })
  }

  const matin = hasFreeTime(start, Math.min(end, 13 * 60), occupations)
  const apresMidi = hasFreeTime(Math.max(start, 13 * 60), end, occupations)
  if (!matin && !apresMidi) return { status: 'off', label: 'COMPLET' }
  if (matin && apresMidi) return { status: 'journee', label: 'Journée' }
  return matin ? { status: 'matin', label: 'Matin' } : { status: 'apres-midi', label: 'Après-midi' }
}

function getStatusPourStory(
  date: Date,
  disponibilites: Map<number, Disponibilite>,
  absences: Absence[],
  rendezvous: RendezVous[],
  surcharges: SurchargesDisponibilite,
): { status: StatutJour; label: string } {
  const choisi = surcharges[dateKey(date)]
  if (!choisi) return getStatus(date, disponibilites, absences, rendezvous)
  if (choisi === 'off') return { status: 'off', label: 'COMPLET' }
  return {
    status: choisi,
    label: choisi === 'matin' ? 'Matin' : choisi === 'apres-midi' ? 'Après-midi' : 'Journée',
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
  ctx.fill()
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function drawStatusDot(ctx: CanvasRenderingContext2D, x: number, y: number, result: { status: StatutJour; label: string }, large = false) {
  if (result.status === 'off') {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-0.62)
    ctx.fillStyle = 'rgba(91, 69, 44, 0.26)'
    ctx.font = large ? '600 26px Inter, Arial, sans-serif' : '600 16px Inter, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('COMPLET', 0, 0)
    ctx.restore()
    return
  }
  ctx.fillStyle = COULEURS[result.status]
  ctx.beginPath()
  ctx.arc(x, y, large ? 36 : 29, 0, Math.PI * 2)
  ctx.fill()
}

function drawBase(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = 'rgba(247, 243, 237, 0.82)'
  roundedRect(ctx, 42, 286, width - 84, height - 396, 34)
}

function drawTitle(ctx: CanvasRenderingContext2D, subtitle: string) {
  ctx.textAlign = 'center'
  ctx.fillStyle = '#5B452C'
  ctx.font = '600 70px Fraunces, Georgia, serif'
  ctx.fillText('DISPONIBILITÉS', 540, 430)
  ctx.font = 'italic 500 45px Fraunces, Georgia, serif'
  ctx.fillText(subtitle, 540, 500)
}

function drawReservationButton(ctx: CanvasRenderingContext2D, y: number) {
  ctx.fillStyle = '#5B452C'
  roundedRect(ctx, 245, y, 590, 76, 2)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#FFFDF9'
  ctx.font = '500 35px Fraunces, Georgia, serif'
  ctx.fillText('RÉSERVATION EN DM', 540, y + 51)
}

function drawLegend(ctx: CanvasRenderingContext2D, y: number) {
  const legend = [['#FFE054', 'Créneau le matin'], ['#F4A11B', "Créneau l’après-midi"], ['#78D649', 'Disponible matin et après-midi']]
  ctx.textAlign = 'left'
  ctx.font = '400 28px Fraunces, Georgia, serif'
  legend.forEach(([color, label], index) => {
    const lineY = y + index * 53
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(203, lineY - 9, 18, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#5B452C'
    ctx.fillText(label, 240, lineY)
  })
}

function drawMonthly(
  ctx: CanvasRenderingContext2D,
  year: number,
  month: number,
  disponibilites: Map<number, Disponibilite>,
  absences: Absence[],
  rendezvous: RendezVous[],
  surcharges: SurchargesDisponibilite,
) {
  drawTitle(ctx, `en ${MOIS[month]}`)
  const gridX = 105
  const gridY = 590
  const cellWidth = 124
  const cellHeight = 143
  const firstDay = new Date(year, month, 1)
  const offset = (firstDay.getDay() + 6) % 7
  const dayCount = new Date(year, month + 1, 0).getDate()
  const rowCount = Math.ceil((offset + dayCount) / 7)

  ctx.fillStyle = '#5B452C'
  ctx.fillRect(gridX, gridY, cellWidth * 7, 68)
  ctx.fillStyle = '#FFFDF9'
  ctx.font = '600 27px Fraunces, Georgia, serif'
  ctx.textAlign = 'center'
  JOURS_COURTS.forEach((label, index) => ctx.fillText(label, gridX + cellWidth * index + cellWidth / 2, gridY + 44))

  for (let index = 0; index < rowCount * 7; index += 1) {
    const col = index % 7
    const row = Math.floor(index / 7)
    const x = gridX + col * cellWidth
    const y = gridY + 68 + row * cellHeight
    ctx.fillStyle = 'rgba(249, 247, 242, 0.62)'
    ctx.fillRect(x, y, cellWidth, cellHeight)
    ctx.strokeStyle = 'rgba(91, 69, 44, 0.38)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(x, y, cellWidth, cellHeight)
    const day = index - offset + 1
    if (day < 1 || day > dayCount) continue
    const result = getStatusPourStory(new Date(year, month, day), disponibilites, absences, rendezvous, surcharges)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#5B452C'
    ctx.font = '500 24px Fraunces, Georgia, serif'
    ctx.fillText(String(day), x + 12, y + 31)
    drawStatusDot(ctx, x + cellWidth / 2, y + 75, result)
    if (result.status !== 'off') {
      ctx.textAlign = 'center'
      ctx.fillStyle = '#5B452C'
      ctx.font = '600 16px Inter, Arial, sans-serif'
      ctx.fillText(result.label, x + cellWidth / 2, y + 121)
    }
  }
  drawLegend(ctx, gridY + 68 + rowCount * cellHeight + 84)
  drawReservationButton(ctx, 1702)
}

function drawWeekly(
  ctx: CanvasRenderingContext2D,
  weekStart: Date,
  disponibilites: Map<number, Disponibilite>,
  absences: Absence[],
  rendezvous: RendezVous[],
  surcharges: SurchargesDisponibilite,
) {
  const weekEnd = addDays(weekStart, 6)
  drawTitle(ctx, `du ${weekStart.getDate()} au ${weekEnd.getDate()} ${MOIS[weekEnd.getMonth()]}`)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#5B452C'
  ctx.font = '400 31px Fraunces, Georgia, serif'
  ctx.fillText('Voici les créneaux disponibles cette semaine', 540, 592)
  const gridX = 92
  const gridY = 665
  const columnWidth = 128
  const cardHeight = 470
  for (let index = 0; index < 7; index += 1) {
    const date = addDays(weekStart, index)
    const result = getStatusPourStory(date, disponibilites, absences, rendezvous, surcharges)
    const x = gridX + index * columnWidth
    ctx.fillStyle = 'rgba(249, 247, 242, 0.78)'
    ctx.fillRect(x, gridY, columnWidth, cardHeight)
    ctx.strokeStyle = 'rgba(91, 69, 44, 0.38)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(x, gridY, columnWidth, cardHeight)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#5B452C'
    ctx.font = '600 23px Fraunces, Georgia, serif'
    ctx.fillText(JOURS_COURTS[index], x + columnWidth / 2, gridY + 45)
    ctx.font = '500 31px Fraunces, Georgia, serif'
    ctx.fillText(String(date.getDate()), x + columnWidth / 2, gridY + 86)
    drawStatusDot(ctx, x + columnWidth / 2, gridY + 195, result, true)
    if (result.status !== 'off') {
      ctx.fillStyle = '#5B452C'
      ctx.font = '600 18px Inter, Arial, sans-serif'
      const label = [result.label]
      label.forEach((line, lineIndex) => ctx.fillText(line, x + columnWidth / 2, gridY + 285 + lineIndex * 25))
    }
  }
  drawLegend(ctx, 1290)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#5B452C'
  ctx.font = '400 30px Fraunces, Georgia, serif'
  ctx.fillText('Chaque prestation ayant une durée différente,', 540, 1512)
  ctx.fillText('certains créneaux peuvent être ajustés.', 540, 1552)
  drawReservationButton(ctx, 1695)
}

async function drawExport(
  canvas: HTMLCanvasElement,
  format: ExportFormat,
  year: number,
  month: number,
  weekStart: Date,
  disponibilites: Map<number, Disponibilite>,
  absences: Absence[],
  rendezvous: RendezVous[],
  surcharges: SurchargesDisponibilite,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const width = 1080
  const height = 1920
  canvas.width = width
  canvas.height = height
  try {
    const image = await loadImage('/disponibilites-fond.jpg')
    const scale = Math.max(width / image.width, height / image.height)
    const imageWidth = image.width * scale
    const imageHeight = image.height * scale
    ctx.drawImage(image, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight)
  } catch {
    ctx.fillStyle = '#D7D0C6'
    ctx.fillRect(0, 0, width, height)
  }
  drawBase(ctx, width, height)
  if (format === 'mois') drawMonthly(ctx, year, month, disponibilites, absences, rendezvous, surcharges)
  else drawWeekly(ctx, weekStart, disponibilites, absences, rendezvous, surcharges)
}

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Impossible de générer l'image."))
      resolve(new File([blob], name, { type: 'image/png' }))
    }, 'image/png')
  })
}

function DisponibilitesExportModal({ onClose }: DisponibilitesExportModalProps) {
  const { getToken } = useAuth()
  const { showToast } = useToast()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const today = useMemo(() => new Date(), [])
  const [format, setFormat] = useState<ExportFormat>('mois')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [weekStart, setWeekStart] = useState(() => mondayOf(today))
  const [disponibilites, setDisponibilites] = useState<Disponibilite[]>([])
  const [absences, setAbsences] = useState<Absence[]>([])
  const [rendezvous, setRendezvous] = useState<RendezVous[]>([])
  const [surcharges, setSurcharges] = useState<SurchargesDisponibilite>({})
  const [statutSelectionne, setStatutSelectionne] = useState<StatutJour>('journee')
  const [loading, setLoading] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [sharing, setSharing] = useState(false)

  const draw = useCallback(async () => {
    // Le canvas n'existe qu'après le chargement : attendre son montage évite une
    // première image vide lorsque les trois requêtes se terminent en même temps.
    if (loading || !canvasRef.current || disponibilites.length === 0) return
    setRendering(true)
    try {
      await drawExport(
        canvasRef.current,
        format,
        year,
        month,
        weekStart,
        new Map(disponibilites.map((item) => [item.jourSemaine, item])),
        absences,
        rendezvous,
        surcharges,
      )
    } finally {
      setRendering(false)
    }
  }, [absences, disponibilites, format, loading, month, rendezvous, surcharges, weekStart, year])

  useEffect(() => {
    Promise.all([
      apiFetch<{ disponibilites: Disponibilite[] }>(getToken, '/api/prestations?resource=disponibilites'),
      apiFetch<{ absences: Absence[] }>(getToken, '/api/absences'),
      apiFetch<{ rendezvous: RendezVous[] }>(getToken, '/api/rendezvous'),
    ])
      .then(([availability, absenceData, rendezvousData]) => {
        setDisponibilites(availability.disponibilites)
        setAbsences(absenceData.absences)
        setRendezvous(rendezvousData.rendezvous)
      })
      .catch((error: unknown) => showToast(error instanceof ApiError ? error.message : 'Impossible de charger les disponibilités.', 'error'))
      .finally(() => setLoading(false))
  }, [getToken, showToast])

  useEffect(() => { void draw() }, [draw])

  function movePeriod(delta: number) {
    if (format === 'mois') {
      const next = new Date(year, month + delta, 1)
      setYear(next.getFullYear())
      setMonth(next.getMonth())
    } else setWeekStart((current) => addDays(current, delta * 7))
  }

  function jourAuPoint(clientX: number, clientY: number): Date | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const bounds = canvas.getBoundingClientRect()
    const x = ((clientX - bounds.left) / bounds.width) * 1080
    const y = ((clientY - bounds.top) / bounds.height) * 1920

    if (format === 'semaine') {
      const gridX = 92
      const gridY = 665
      const columnWidth = 128
      const cardHeight = 470
      if (x < gridX || x >= gridX + columnWidth * 7 || y < gridY || y >= gridY + cardHeight) return null
      return addDays(weekStart, Math.floor((x - gridX) / columnWidth))
    }

    const gridX = 105
    const gridY = 590 + 68
    const cellWidth = 124
    const cellHeight = 143
    const firstDay = new Date(year, month, 1)
    const offset = (firstDay.getDay() + 6) % 7
    const dayCount = new Date(year, month + 1, 0).getDate()
    if (x < gridX || x >= gridX + cellWidth * 7 || y < gridY) return null
    const column = Math.floor((x - gridX) / cellWidth)
    const row = Math.floor((y - gridY) / cellHeight)
    const day = row * 7 + column - offset + 1
    if (day < 1 || day > dayCount) return null
    return new Date(year, month, day)
  }

  function marquerJour(event: MouseEvent<HTMLCanvasElement>) {
    const date = jourAuPoint(event.clientX, event.clientY)
    if (!date) return
    setSurcharges((current) => ({ ...current, [dateKey(date)]: statutSelectionne }))
  }

  async function share() {
    if (!canvasRef.current) return
    setSharing(true)
    try {
      const period = format === 'mois' ? `${year}-${String(month + 1).padStart(2, '0')}` : dateKey(weekStart)
      const file = await canvasToFile(canvasRef.current, `disponibilites-${period}.png`)
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Disponibilités Bella Luna', text: 'Disponibilités Bella Luna' })
        showToast('Image prête à être partagée.')
      } else {
        const url = URL.createObjectURL(file)
        const link = document.createElement('a')
        link.href = url
        link.download = file.name
        link.click()
        URL.revokeObjectURL(url)
        showToast("Image téléchargée. Tu peux l'ajouter à ta story Instagram.")
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      showToast(error instanceof Error ? error.message : "Impossible de partager l'image.", 'error')
    } finally { setSharing(false) }
  }

  const weekEnd = addDays(weekStart, 6)
  const periodLabel = format === 'mois' ? `${MOIS[month]} ${year}` : `du ${weekStart.getDate()} au ${weekEnd.getDate()} ${MOIS[weekEnd.getMonth()]}`
  const aucunJourActif = disponibilites.length > 0 && disponibilites.every((item) => !item.actif)

  return (
    <Modal size="lg">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-serif text-xl font-semibold text-sage-dark">Créer une story de disponibilités</h3>
          <p className="text-xs text-text-muted mt-1">Le même modèle que tes stories : fond de la cabine, calendrier, pastilles et réservation en DM.</p>
        </div>
        <button type="button" onClick={onClose} className="text-text-muted text-xl leading-none min-w-11 min-h-11" aria-label="Fermer">×</button>
      </div>
      <div className="flex items-center bg-sage-pale rounded-[10px] p-1 mb-3" role="tablist" aria-label="Format de l’export">
        {(['mois', 'semaine'] as const).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={format === item} onClick={() => setFormat(item)} className={`flex-1 min-h-11 rounded-[8px] text-sm font-semibold ${format === item ? 'bg-sage-dark text-white' : 'text-text-muted'}`}>
            Vue {item}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 mb-4">
        <button type="button" onClick={() => movePeriod(-1)} className="btn-secondary min-w-11 min-h-11" aria-label="Période précédente">←</button>
        {format === 'mois' ? <>
          <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="input max-w-36" aria-label="Mois">
            {MOIS.map((label, index) => <option key={label} value={index}>{label}</option>)}
          </select>
          <input type="number" value={year} onChange={(event) => setYear(Number(event.target.value) || today.getFullYear())} className="input w-24" aria-label="Année" />
        </> : <span className="text-sm font-semibold text-sage-dark text-center min-w-44">Semaine {periodLabel}</span>}
        <button type="button" onClick={() => movePeriod(1)} className="btn-secondary min-w-11 min-h-11" aria-label="Période suivante">→</button>
      </div>
      <div className="bg-sage-pale rounded-2xl p-3 flex justify-center min-h-64">
        {loading ? <p className="text-sm text-text-muted self-center">Préparation de l’image…</p> : <canvas ref={canvasRef} onClick={marquerJour} className="w-full max-w-[390px] rounded-xl shadow-sm cursor-pointer" role="button" tabIndex={0} aria-label="Appuyer sur un jour du calendrier pour modifier sa disponibilité" />}
      </div>
      <div className="mt-3 bg-sage-pale rounded-[10px] p-3">
        <p className="text-xs font-semibold text-sage-dark">Ajuster la story si besoin</p>
        <p className="text-xs text-text-muted mt-1">Les pastilles sont calculées depuis l’agenda. Choisis une couleur, puis touche un jour pour la modifier uniquement sur cette image.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          {([
            ['off', 'Complet'],
            ['matin', 'Matin'],
            ['apres-midi', 'Après-midi'],
            ['journee', 'Journée'],
          ] as const).map(([status, label]) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatutSelectionne(status)}
              className={`min-h-11 rounded-[8px] border text-xs font-semibold ${statutSelectionne === status ? 'border-sage-dark bg-white text-sage-dark' : 'border-transparent bg-white/60 text-text-muted'}`}
            >
              <span className="inline-block w-3 h-3 rounded-full mr-1.5 align-[-1px]" style={{ backgroundColor: COULEURS[status] }} />
              {label}
            </button>
          ))}
        </div>
        {aucunJourActif && <p className="text-xs text-gold-text mt-3">Aucun horaire hebdomadaire n’est activé : le mode automatique se base sur les créneaux réellement libres de l’agenda, du lundi au samedi.</p>}
        {Object.keys(surcharges).length > 0 && <button type="button" onClick={() => setSurcharges({})} className="text-xs font-semibold text-sage-dark hover:underline mt-3">Revenir aux disponibilités de l’agenda</button>}
      </div>
      <p className="text-xs text-text-muted mt-1">Sur téléphone, le partage ouvre directement les applications disponibles, dont Instagram s’il est installé.</p>
      <div className="grid sm:grid-cols-[auto_1fr] gap-3 mt-4">
        <button type="button" onClick={onClose} className="btn-secondary min-h-14">Fermer</button>
        <button
          type="button"
          onClick={share}
          disabled={loading || rendering || sharing}
          className="min-h-14 rounded-[10px] bg-sage-dark text-white px-4 flex items-center justify-center gap-3 shadow-sm disabled:opacity-50"
        >
          <span className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0"><Icon name="share" size={19} /></span>
          <span className="text-left leading-tight">
            <span className="block text-sm font-semibold">{sharing || rendering ? 'Préparation de l’image…' : 'Partager la story'}</span>
            <span className="block text-[11px] text-white/75 mt-0.5">Instagram, Messages et autres applications</span>
          </span>
        </button>
      </div>
    </Modal>
  )
}

export default DisponibilitesExportModal
