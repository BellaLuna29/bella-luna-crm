const STYLES: Record<string, string> = {
  Confirmé: 'bg-sage-light text-sage-dark',
  Honoré: 'bg-gold-pale text-gold-text',
  Annulé: 'bg-danger-pale text-danger',
}

function RdvStatusPill({ statut }: { statut: string }) {
  const style = STYLES[statut] ?? 'bg-sage-light text-sage-dark'
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full inline-block ${style}`}>
      {statut}
    </span>
  )
}

export default RdvStatusPill
