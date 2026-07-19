export function formatMontant(montant: number | null): string {
  if (montant === null) return '—'
  const formatted = montant.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${formatted} €`
}
