export interface TemplateContext {
  nomComplet: string
  date?: string
  prestation?: string
  montant?: number
  promoNom?: string
}

export interface MessageTemplate {
  key: string
  label: string
  subject: string
  build: (ctx: TemplateContext) => string
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    key: 'rappel',
    label: 'Rappel de rendez-vous',
    subject: 'Rappel de votre rendez-vous — Bella Luna',
    build: (ctx) =>
      `Bonjour ${ctx.nomComplet}, un petit rappel de votre rendez-vous${ctx.prestation ? ` (${ctx.prestation})` : ''}${ctx.date ? ` le ${ctx.date}` : ''} à l'institut Bella Luna. À très bientôt !`,
  },
  {
    key: 'recontact',
    label: 'Reprendre contact',
    subject: 'On a hâte de vous revoir — Bella Luna',
    build: (ctx) =>
      `Bonjour ${ctx.nomComplet}, cela fait un moment que l'on ne vous a pas vue à l'institut Bella Luna. N'hésitez pas à prendre rendez-vous quand vous le souhaitez, ce sera un plaisir de vous retrouver !`,
  },
  {
    key: 'anniversaire',
    label: 'Anniversaire',
    subject: 'Joyeux anniversaire !',
    build: (ctx) =>
      `Joyeux anniversaire ${ctx.nomComplet} ! 🎂 Toute l'équipe de Bella Luna vous souhaite une merveilleuse journée.`,
  },
  {
    key: 'facture',
    label: 'Facture impayée',
    subject: 'Rappel de facture — Bella Luna',
    build: (ctx) =>
      `Bonjour ${ctx.nomComplet}, nous nous permettons de vous rappeler qu'une facture${ctx.montant ? ` de ${ctx.montant.toFixed(2)} €` : ''} est toujours en attente de règlement. Merci de votre compréhension.`,
  },
  {
    key: 'promo',
    label: 'Offre / promotion',
    subject: 'Une offre pour vous — Bella Luna',
    build: (ctx) =>
      `Bonjour ${ctx.nomComplet}, profitez${ctx.promoNom ? ` de notre offre « ${ctx.promoNom} »` : " d'une offre en ce moment"} à l'institut Bella Luna ! N'hésitez pas à nous contacter pour en savoir plus.`,
  },
  {
    key: 'libre',
    label: 'Message libre',
    subject: 'Bella Luna',
    build: (ctx) => `Bonjour ${ctx.nomComplet}, `,
  },
]
