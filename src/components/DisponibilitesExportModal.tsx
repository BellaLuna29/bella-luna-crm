import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch, ApiError } from '../lib/api'
import { useToast } from './ToastProvider'
import Modal from './Modal'

interface Disponibilite {
  jourSemaine: number
  actif: boolean
  heureDebut: string
  heureFin: string
}

interface Absence {
  dateDebut: string | null
  dateFin: string | null
  demiJournee: string | null
  heureDebut: string | null
  heureFin: string | null
  recurrence: string | null
  jourSemaine: number | null
}

interface DisponibilitesExportModalProps {
  onClose: () => void
}

type StatutJour = 'off' | 'matin' | 'apres-midi' | 'journee'

const JOUR_COURT = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

function minutes(value: string | null): number | null {
  if (!value) return null
  const [hour, minute] = value.slice(0, 5).split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

function formatHour(value: string | null): string {
  if (!value) return ''
  const [hour, minute] = value.slice(0, 5).split(':')
  return minute === '00' ? `${Number(hour)}h` : `${Number(hour)}h${minute}`
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function applies(absence: Absence, date: Date, dateKey: string): boolean {
  if (absence.recurrence === 'hebdomadaire') return absence.jourSemaine === date.getDay()
  return Boolean(absence.dateDebut && absence.dateFin && absence.dateDebut <= dateKey && dateKey <= absence.dateFin)
}

function getStatus(
  date: Date,
  dateKey: string,
  disponibilites: Map<number, Disponibilite>,
  absences: Absence[],
): { status: StatutJour; label: string } {
  const dispo = disponibilites.get(date.getDay())
  if (!dispo?.actif) return { status: 'off', label: 'Fermé' }

  let start = minutes(dispo.heureDebut) ?? 9 * 60
  let end = minutes(dispo.heureFin) ?? 18 * 60
  let horairesAjustes = false
  const dayAbsences = absences.filter((absence) => applies(absence, date, dateKey))
  for (const absence of dayAbsences) {
    if (!absence.demiJournee && absence.heureDebut === null && absence.heureFin === null) {
      return { status: 'off', label: 'Indisponible' }
    }
    if (absence.demiJournee === 'matin') {
      start = Math.max(start, 13 * 60)
      continue
    }
    if (absence.demiJournee === 'apres-midi') {
      end = Math.min(end, 13 * 60)
      continue
    }
    const absenceStart = minutes(absence.heureDebut)
    const absenceEnd = minutes(absence.heureFin)
    if (absenceStart !== null && absenceEnd !== null && absenceStart < end && absenceEnd > start) {
      if (absenceStart <= start && absenceEnd >= end) return { status: 'off', label: 'Indisponible' }
      horairesAjustes = true
    }
  }

  if (start >= end) return { status: 'off', label: 'Indisponible' }
  const label = horairesAjustes ? 'Horaires ajustés' : `${formatHour(dispo.heureDebut)}–${formatHour(dispo.heureFin)}`
  if (end <= 13 * 60) return { status: 'matin', label }
  if (start >= 13 * 60) return { status: 'apres-midi', label }
  return { status: 'journee', label }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
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

function drawExport(
  canvas: HTMLCanvasElement,
  year: number,
  month: number,
  disponibilites: Map<number, Disponibilite>,
  absences: Absence[],
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const width = 1080
  const height = 1920
  canvas.width = width
  canvas.height = height

  ctx.fillStyle = '#E8E4DC'
  ctx.fillRect(0, 0, width, height)
  loadImage('/disponibilites-fond.jpg')
    .then((image) => {
      const scale = Math.max(width / image.width, height / image.height)
      const imageWidth = image.width * scale
      const imageHeight = image.height * scale
      ctx.globalAlpha = 0.42
      ctx.drawImage(image, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight)
      ctx.globalAlpha = 1
      drawCard(ctx, year, month, disponibilites, absences)
    })
    .catch(() => drawCard(ctx, year, month, disponibilites, absences))
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  year: number,
  month: number,
  disponibilites: Map<number, Disponibilite>,
  absences: Absence[],
) {
  const width = 1080
  const cardX = 54
  const cardY = 76
  const cardWidth = 972
  const cardHeight = 1768
  ctx.fillStyle = 'rgba(250,248,244,0.92)'
  roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 30)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#3A5A50'
  ctx.font = '600 58px Georgia, serif'
  ctx.fillText('DISPONIBILITÉS', width / 2, 190)
  ctx.fillStyle = '#7B654A'
  ctx.font = 'italic 600 48px Georgia, serif'
  ctx.fillText(`${MOIS[month]} ${year}`, width / 2, 258)

  const gridX = 110
  const gridY = 350
  const cellWidth = 122
  const cellHeight = 142
  ctx.fillStyle = '#7B654A'
  ctx.fillRect(gridX, gridY, cellWidth * 7, 62)
  ctx.fillStyle = '#FFFDF9'
  ctx.font = '600 28px Arial, sans-serif'
  JOUR_COURT.forEach((label, index) => ctx.fillText(label, gridX + cellWidth * index + cellWidth / 2, gridY + 40))

  const firstDay = new Date(year, month, 1)
  const offset = (firstDay.getDay() + 6) % 7
  const dayCount = new Date(year, month + 1, 0).getDate()
  const colors: Record<StatutJour, string> = {
    off: '#D1CDC5',
    matin: '#F5D55A',
    'apres-midi': '#F3A01B',
    journee: '#7BD647',
  }

  ctx.font = '400 22px Arial, sans-serif'
  for (let day = 1; day <= dayCount; day += 1) {
    const index = offset + day - 1
    const col = index % 7
    const row = Math.floor(index / 7)
    const x = gridX + col * cellWidth
    const y = gridY + 62 + row * cellHeight
    const date = new Date(year, month, day)
    const key = isoDate(year, month, day)
    const result = getStatus(date, key, disponibilites, absences)

    ctx.fillStyle = row % 2 === 0 ? 'rgba(255,255,255,0.62)' : 'rgba(244,241,235,0.72)'
    ctx.fillRect(x, y, cellWidth, cellHeight)
    ctx.strokeStyle = 'rgba(123,101,74,0.28)'
    ctx.strokeRect(x, y, cellWidth, cellHeight)
    ctx.textAlign = 'left'
    ctx.fillStyle = '#4E443A'
    ctx.font = '400 21px Arial, sans-serif'
    ctx.fillText(String(day), x + 12, y + 28)
    ctx.textAlign = 'center'
    ctx.fillStyle = colors[result.status]
    ctx.beginPath()
    ctx.arc(x + cellWidth / 2, y + 70, 25, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#6A5D4F'
    ctx.font = '400 14px Arial, sans-serif'
    ctx.fillText(result.status === 'off' ? '—' : result.label, x + cellWidth / 2, y + 116)
  }

  const legendY = gridY + 62 + Math.ceil((offset + dayCount) / 7) * cellHeight + 72
  ctx.textAlign = 'left'
  ctx.fillStyle = '#5D5145'
  ctx.font = '500 24px Arial, sans-serif'
  const legend = [
    ['#F5D55A', 'Créneau le matin'],
    ['#F3A01B', "Créneau l'après-midi"],
    ['#7BD647', 'Disponible toute la journée'],
    ['#D1CDC5', 'Indisponible'],
  ]
  legend.forEach(([color, label], index) => {
    const y = legendY + index * 52
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(180, y - 8, 16, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#5D5145'
    ctx.fillText(label, 215, y)
  })

  ctx.fillStyle = '#7B654A'
  ctx.font = '500 29px Georgia, serif'
  ctx.textAlign = 'center'
  ctx.fillText('Réservation en ligne ou par message privé', width / 2, cardY + cardHeight - 68)
  ctx.fillStyle = '#3A5A50'
  ctx.font = '600 20px Arial, sans-serif'
  ctx.fillText('BELLA LUNA · MASSAGE BIEN-ÊTRE', width / 2, cardY + cardHeight - 32)
}

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Impossible de générer l'image."))
        return
      }
      resolve(new File([blob], name, { type: 'image/png' }))
    }, 'image/png')
  })
}

function DisponibilitesExportModal({ onClose }: DisponibilitesExportModalProps) {
  const { getToken } = useAuth()
  const { showToast } = useToast()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [disponibilites, setDisponibilites] = useState<Disponibilite[]>([])
  const [absences, setAbsences] = useState<Absence[]>([])
  const [loading, setLoading] = useState(true)
  const [sharing, setSharing] = useState(false)

  const draw = useCallback(() => {
    if (!canvasRef.current || disponibilites.length === 0) return
    drawExport(canvasRef.current, year, month, new Map(disponibilites.map((item) => [item.jourSemaine, item])), absences)
  }, [absences, disponibilites, month, year])

  useEffect(() => {
    Promise.all([
      apiFetch<{ disponibilites: Disponibilite[] }>(getToken, '/api/prestations?resource=disponibilites'),
      apiFetch<{ absences: Absence[] }>(getToken, '/api/absences'),
    ])
      .then(([availability, absenceData]) => {
        setDisponibilites(availability.disponibilites)
        setAbsences(absenceData.absences)
      })
      .catch((error: unknown) => showToast(error instanceof ApiError ? error.message : 'Impossible de charger les disponibilités.', 'error'))
      .finally(() => setLoading(false))
  }, [getToken, showToast])

  useEffect(() => {
    draw()
  }, [draw])

  async function share() {
    if (!canvasRef.current) return
    setSharing(true)
    try {
      const file = await canvasToFile(canvasRef.current, `disponibilites-${year}-${String(month + 1).padStart(2, '0')}.png`)
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Disponibilités ${MOIS[month]} ${year}`, text: 'Disponibilités Bella Luna' })
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
    } finally {
      setSharing(false)
    }
  }

  function moveMonth(delta: number) {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
  }

  return (
    <Modal size="lg">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-serif text-xl font-semibold text-sage-dark">Exporter les disponibilités</h3>
          <p className="text-xs text-text-muted mt-1">Crée une image mensuelle à partager sur Instagram ou par message.</p>
        </div>
        <button type="button" onClick={onClose} className="text-text-muted text-xl leading-none" aria-label="Fermer">
          ×
        </button>
      </div>
      <div className="flex items-center justify-center gap-2 mb-4">
        <button type="button" onClick={() => moveMonth(-1)} className="btn-secondary" aria-label="Mois précédent">
          ←
        </button>
        <select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="input max-w-36">
          {MOIS.map((label, index) => <option key={label} value={index}>{label}</option>)}
        </select>
        <input type="number" value={year} onChange={(event) => setYear(Number(event.target.value) || now.getFullYear())} className="input w-24" aria-label="Année" />
        <button type="button" onClick={() => moveMonth(1)} className="btn-secondary" aria-label="Mois suivant">
          →
        </button>
      </div>
      <div className="bg-sage-pale rounded-2xl p-3 flex justify-center min-h-64">
        {loading ? <p className="text-sm text-text-muted self-center">Préparation de l’image…</p> : <canvas ref={canvasRef} className="w-full max-w-[300px] rounded-xl shadow-sm" />}
      </div>
      <p className="text-xs text-text-muted mt-3">
        Sur téléphone, « Partager / Instagram » ouvre la feuille de partage native. Instagram sera proposé s’il est installé ; sinon l’image sera téléchargée.
      </p>
      <p className="text-xs text-text-muted mt-1">
        Les couleurs utilisent les disponibilités hebdomadaires et les absences déjà enregistrées dans l’agenda.
      </p>
      <div className="flex justify-end gap-3 mt-4">
        <button type="button" onClick={onClose} className="btn-secondary">Fermer</button>
        <button type="button" onClick={share} disabled={loading || sharing} className="btn-primary disabled:opacity-50">
          {sharing ? 'Préparation…' : 'Partager / Instagram'}
        </button>
      </div>
    </Modal>
  )
}

export default DisponibilitesExportModal
