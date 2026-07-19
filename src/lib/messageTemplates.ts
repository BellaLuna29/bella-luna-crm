import { formatMontant } from './formatMontant'

export interface TemplateContext {
  nomComplet: string
  date?: string
  prestation?: string
  montant?: number
  promoNom?: string
  lienQuestionnaire?: string
}

export interface MessageTemplate {
  key: string
  label: string
  subject: string
  build: (ctx: TemplateContext) => string
}

const ADRESSE_INFO = `Voici les informations pratiques :
Adresse : 8 allée Charles Godeby, 29000 Quimper
Interphone : « Clémence. Mgr » et je suis en rez-de-chaussée
Des places de parking sont disponibles à proximité, vous pourrez vous garer facilement 😊

Tenue conseillée : en sous-vêtement type boxer, short ou slip de bain (selon ce qui est le plus confortable pour vous).`

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    key: 'rappel',
    label: 'Rappel de rendez-vous',
    subject: 'Rappel de votre rendez-vous — Bella Luna',
    build: (ctx) => {
      const prestation = ctx.prestation || 'massage'
      const quandLabel = ctx.date ? ` prévu le ${ctx.date}` : ''
      const lien = ctx.lienQuestionnaire || '[Lien à insérer]'
      return `Bonjour !
Je reviens vers vous concernant votre ${prestation}${quandLabel} 💆🏽‍♀️

Petit rappel pratique : merci d'arriver à l'heure indiquée ou jusqu'à 5 minutes avant maximum. Il n'est pas nécessaire d'arriver plus tôt, afin de me permettre de vous accueillir dans les meilleures conditions. ✨

${ADRESSE_INFO}

Le Tarif du ${prestation} est à : ${ctx.montant ? ctx.montant.toFixed(0) : '—'} €
Moyens de paiement acceptés : espèces et virement (Wero).

📝 Avant notre rendez-vous, je vous invite à remplir ce petit questionnaire pour que je puisse adapter le ${prestation} à vos besoins : ${lien}

N'hésitez pas si vous avez des questions, je suis disponible 🤗
Très belle journée à vous`
    },
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
      `Bonjour ${ctx.nomComplet}, nous nous permettons de vous rappeler qu'une facture${ctx.montant ? ` de ${formatMontant(ctx.montant)}` : ''} est toujours en attente de règlement. Merci de votre compréhension.`,
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
