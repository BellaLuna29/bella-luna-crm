const STYLES: Record<string, string> = {
  Régulière: 'bg-sage-light text-sage-dark',
  Nouvelle: 'bg-gold-pale text-gold-text',
  Inactive: 'bg-danger-pale text-danger',
}

function StatusPill({ statut }: { statut: string }) {
  const style = STYLES[statut] ?? 'bg-sage-light text-sage-dark'
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full inline-block ${style}`}>
      {statut}
    </span>
  )
}

export default StatusPill
