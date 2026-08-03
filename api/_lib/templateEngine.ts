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
 * Server-side mirror of src/lib/templateEngine.ts — kept as a separate copy
 * since api/ and src/ are built as independent bundles. Keep both in sync if
 * the placeholder set changes.
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
