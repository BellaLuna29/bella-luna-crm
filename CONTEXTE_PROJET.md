# PROMPT À DONNER AU NOUVEAU CHAT

> Copiez-collez tout ce qui suit (à partir de la ligne de séparation) dans un nouveau chat Claude. Ce prompt contient tout le contexte, l'architecture décidée, et la mission.

---

## CONTEXTE DU PROJET

Je développe une application web de gestion pour un institut de bien-être / massage nommé **Bella Luna**, tenu par une praticienne, **Clémence**. L'app remplacera une interface Airtable jugée trop rigide. Je ne code pas moi-même : tu feras l'intégralité du code et de la sécurité. Tu travailleras via **Claude Code**, déjà installé sur ma machine.

L'application doit être **entièrement en français**, pensée **tablette d'abord** (Clémence travaille sur tablette), mais fonctionnelle aussi sur PC et mobile.

## UTILISATEURS

Deux comptes seulement, avec les mêmes droits (accès total) :
- Clémence (la praticienne)
- Moi (l'administrateur qui maintient l'outil)

Dans un futur lointain, d'autres utilisateurs pourraient être ajoutés si elle recrute — l'architecture doit le permettre sans être surdimensionnée pour autant.

## ARCHITECTURE DÉCIDÉE (ne pas remettre en question sans raison technique forte)

- **Frontend** : React 18 + TypeScript + Vite, style TailwindCSS. Build statique hébergé sur **O2switch** (hébergement mutualisé que je possède déjà).
- **Backend API** : fonctions serverless sur **Vercel** (plan gratuit). C'est la couche qui détient les clés Airtable — elles ne doivent JAMAIS être exposées côté React.
- **Authentification** : **Clerk** (plan gratuit). Aucun mot de passe stocké par nous, aucun JWT/bcrypt maison. Deux comptes créés dans Clerk.
- **Base de données** : **Airtable** (base existante, ID `appybml05FLcP9M1j`, plan Pro à 10 €/mois).
- **Automations futures (phase 2)** : Make.com déclenchera SMS (via Brevo) et génération de PDF de factures via webhooks. En phase 1, ces fonctionnalités sont présentes dans l'UI mais affichent « Bientôt disponible ».
- **Pas de real-time / polling** : les données se rafraîchissent au chargement de chaque page + un bouton « Actualiser ». Inutile de poller (2 utilisateurs, ~4 clients/jour).

## STRUCTURE AIRTABLE (base existante, à réutiliser)

Base « Bella Luna — Gestion », ID `appybml05FLcP9M1j`. Tables principales :

- **Clientes** : Nom, Prénom, Téléphone, Email, Date de naissance, Métier, Notes personnelles (préférences, contre-indications), Statut (Nouvelle / Régulière / Inactive), Newsletter, + liens vers Rendez-vous, Cures, Factures.
- **Prestations** : Nom, Catégorie (Massages Relaxants / Drainage Lymphatique / Madérothérapie / Extensions de cils / Massage Sportif), Durée, Prix, Type (Séance unique / Cure 5 / Cure 8 / Remplissage / Dépose), Actif. ~27 prestations déjà saisies.
- **Rendez-vous** (table centrale) : Date/Heure, lien Cliente, lien Prestation, Statut (Confirmé / Honoré / Annulé / No-show), Notes, Prix facturé, lien Facture, tags formule (« Honoré ✓ », « Facture émise OUI/NON »).
- **Cures** : suivi des forfaits 5/8 séances, avec formules « séances restantes » et statut.
- **Factures** : Numéro séquentiel, Date, lien Cliente, lien Rendez-vous, Montant HT, Réduction, Montant TTC (formule), Payée, lien Promotion.
- **Promotions** : Nom, Type/Valeur de réduction, Active, dates, Clientes ciblées, Prestations concernées.
- **Dépenses** : Date, Catégorie, Description, Montant, Justificatif, Récurrente.
- **Questionnaires** : référence de 4 Google Forms mappés par catégorie de service (un manque : Extensions de cils).

**Important sur Airtable** (contraintes rencontrées) : les champs formule et les champs de lien entre tables ne peuvent pas être créés dans l'appel initial de création de base. Les types rollup/lookup/autoNumber ne sont pas créables via l'API du connecteur. Ces contraintes concernent la *modification* de la base — pour l'app React, tu lis/écris simplement via l'API Airtable REST classique côté backend Vercel.

## MODULES DE L'APPLICATION (périmètre phase 1)

L'app reprend le design d'un mockup HTML que je te fournirai (fichier `Bella_Luna_CRM_Mockup.html`). Modules :

1. **Tableau de bord** : RDV du jour, stats de la semaine (nb RDV, clientes actives, CA du mois, cures en cours), liste « à ne pas oublier » (relances, anniversaires, clientes inactives).
2. **Clientes** : liste avec recherche, fiche détaillée (coordonnées, notes, historique des RDV, factures, cure en cours avec barre de progression). Création et édition.
3. **Rendez-vous** : agenda par jour/semaine, création de RDV, ajout de notes, statuts, historique complet par cliente.
4. **Facturation** : facture générée après un RDV honoré, application automatique des promotions actives, historique des paiements, gestion des promotions (activer/désactiver).
5. **Newsletter / SMS** (phase 2) : onglet présent mais marqué « Bientôt disponible ».

Palette du mockup : vert sauge (`#3A5A50`), doré (`#C9A86A`), fonds crème/sauge clair. Typo : Fraunces (titres) + Inter (corps).

## DESIGN / UX

- Tablette d'abord (surfaces tactiles généreuses, boutons larges).
- Sobre, élégant, cohérent avec le mockup (que je te donne).
- Français partout, y compris messages d'erreur et états vides.
- Formats français : dates JJ/MM/AAAA, montants « 85,00 € », téléphones « 06 XX XX XX XX ».

## TA MISSION (dans ce chat)

Avant d'écrire du code, aide-moi à :
1. Valider le plan de développement découpé en étapes livrables (quoi tester à chaque étape).
2. Lister précisément ce que je dois préparer de mon côté (comptes Vercel, Clerk, clé API Airtable, structure de dossiers) — avec les instructions pas-à-pas, sachant que je ne suis pas développeur.
3. Établir l'ordre de construction : d'abord le squelette (auth Clerk + connexion Airtable + une page qui liste les clientes pour prouver que la chaîne complète fonctionne), puis les modules un par un.

Ensuite, on développera ensemble via Claude Code, module par module, avec une validation visuelle à chaque étape avant de passer au suivant.

## CONTRAINTES IMPORTANTES

- Je ne code pas. Explique chaque action que je dois faire en langage simple.
- Sécurité : les clés Airtable vivent uniquement dans les variables d'environnement Vercel, jamais dans le code React ni sur O2switch.
- Données de santé (notes clientes, contre-indications) : rester sobre côté RGPD — pas de collecte inutile, accès protégé par Clerk.
- Livrables progressifs et testables : je veux voir quelque chose fonctionner tôt, pas attendre 2 semaines un bloc monolithique.

Commence par me confirmer que tu as bien compris l'architecture, puis propose-moi le plan de développement étape par étape et la liste exacte de ce que je dois préparer avant qu'on écrive la première ligne de code.
