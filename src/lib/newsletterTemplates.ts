export interface NewsletterTemplate {
  key: string
  label: string
  subject: string
  body: string
}

export const NEWSLETTER_TEMPLATES: NewsletterTemplate[] = [
  {
    key: 'offre-du-mois',
    label: 'Offre du mois',
    subject: "Une offre du mois pour vous à l'institut Bella Luna",
    body: `Bonjour,

Ce mois-ci, profitez d'une offre spéciale sur [prestation] : [détail de la réduction ou du code promo].

N'hésitez pas à me contacter pour réserver votre créneau.

Très belle journée à vous,
Bella Luna`,
  },
  {
    key: 'nouveaute',
    label: 'Nouvelle prestation',
    subject: 'Une nouveauté à découvrir — Bella Luna',
    body: `Bonjour,

Je suis ravie de vous annoncer l'arrivée d'une nouvelle prestation à l'institut : [nom de la prestation].

[Quelques mots sur les bienfaits / le déroulé]

Contactez-moi si vous souhaitez en savoir plus ou réserver un premier rendez-vous.

À très bientôt,
Bella Luna`,
  },
  {
    key: 'fermeture',
    label: 'Fermeture exceptionnelle / congés',
    subject: 'Fermeture exceptionnelle — Bella Luna',
    body: `Bonjour,

Je vous informe que l'institut sera fermé du [date début] au [date fin].

Les rendez-vous prévus sur cette période seront reprogrammés dès ma réouverture. Merci de votre compréhension.

Très belle journée à vous,
Bella Luna`,
  },
  {
    key: 'saison',
    label: 'Rappel bienfaits de saison',
    subject: 'Prenez soin de vous en cette saison — Bella Luna',
    body: `Bonjour,

À l'approche de [saison/événement], c'est le moment idéal pour prendre soin de vous avec [prestation conseillée].

N'hésitez pas à réserver votre créneau, je serai ravie de vous accueillir.

Très belle journée à vous,
Bella Luna`,
  },
  {
    key: 'libre',
    label: 'Message libre',
    subject: '',
    body: `Bonjour,

`,
  },
]
