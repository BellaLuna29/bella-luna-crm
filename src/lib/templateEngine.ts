export interface TemplateContext {
  nomComplet: string
  date?: string
  prestation?: string
  montant?: number
  promoNom?: string
  lienQuestionnaire?: string
  recompense?: string
}

/**
 * Replaces {{token}} placeholders in a stored template body with values from
 * the context. Tokens with no matching context value fall back to a sensible
 * default rather than leaving a literal "{{xxx}}" in the sent message.
 */
export function renderTemplate(corps: string, ctx: TemplateContext): string {
  const values: Record<string, string> = {
    nomComplet: ctx.nomComplet,
    date: ctx.date ?? '',
    prestation: ctx.prestation ?? 'votre soin',
    montant: ctx.montant !== undefined ? `${ctx.montant.toFixed(0)} €` : '—',
    promoNom: ctx.promoNom ?? '',
    lienQuestionnaire: ctx.lienQuestionnaire ?? '[Lien à insérer]',
    recompense: ctx.recompense ?? 'un avantage fidélité',
  }
  return corps.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match)
}
