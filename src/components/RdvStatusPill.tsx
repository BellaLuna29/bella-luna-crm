const STYLES: Record<string, string> = {
  Confirmé: 'bg-sage-light text-sage-dark',
  Honoré: 'bg-gold-pale text-gold-text',
  Annulé: 'bg-danger-pale text-danger',
  'En attente': 'bg-gold text-white',
}

const SHORT: Record<string, string> = {
  Confirmé: 'C',
  Honoré: 'H',
  Annulé: 'A',
  'En attente': '?',
}

function RdvStatusPill({ statut, compact }: { statut: string; compact?: boolean }) {
  const style = STYLES[statut] ?? 'bg-sage-light text-sage-dark'
  const label = compact ? (SHORT[statut] ?? statut[0] ?? '?') : statut
  return (
    <span
      className={`text-xs font-semibold rounded-full inline-block ${compact ? 'w-5 h-5 leading-5 text-center' : 'px-2.5 py-1'} ${style}`}
      title={statut}
    >
      {label}
    </span>
  )
}

export default RdvStatusPill
