# Mission : corriger les problèmes identifiés lors de la revue de code

Corrige les 9 points suivants, un par un, sans rien refactorer d'autre. Après chaque correction, vérifie que `npm run build` et `npm run lint` passent sans erreur. Ne touche à aucune fonctionnalité existante.

## 1. Sécurité — liste blanche d'utilisateurs Clerk (CRITIQUE)

Dans `api/_lib/auth.ts`, après `verifyToken`, vérifie que `payload.sub` fait partie d'une liste blanche définie dans une variable d'environnement `ALLOWED_USER_IDS` (IDs Clerk séparés par des virgules). Si la variable est définie et que l'utilisateur n'y figure pas, lève `AuthError('Accès non autorisé.')`. Si la variable est absente, comportement actuel inchangé (pour ne pas casser le dev local). Ajoute `ALLOWED_USER_IDS=` dans `.env.example` avec un commentaire explicatif en français.

## 2. Sécurité — restreindre le CORS

Dans `api/_lib/cors.ts` : supprime la regex `VERCEL_ORIGIN_RE` qui accepte n'importe quel domaine `*.vercel.app`. À la place, autorise : les origines de `DEV_ORIGINS`, la valeur de `ALLOWED_ORIGIN`, et une nouvelle variable optionnelle `VERCEL_URL_ORIGIN` (URL exacte du déploiement Vercel, ex. `https://bella-luna-crm.vercel.app`). Ajoute `VERCEL_URL_ORIGIN=` dans `.env.example`.

## 3. Bug — tri des prestations inopérant

Dans `api/prestations.ts` (vers la ligne 301) : `a.categorie.localeCompare(a.categorie)` compare la catégorie avec elle-même. Remplacer par `a.categorie.localeCompare(b.categorie)`.

## 4. Format français des montants

Créer `src/lib/formatMontant.ts` exportant `formatMontant(montant: number | null): string` qui renvoie `—` si null, sinon le montant au format français avec virgule et espace insécable avant € : `85,00 €`. Utiliser `toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`. Remplacer TOUS les usages de `toFixed(2)` + `€` par cette fonction dans : `src/views/FacturationView.tsx` (3 occurrences : formatMontant local, stats.encaisseMois, stats.totalImpaye), `src/views/ComptaView.tsx`, `src/lib/messageTemplates.ts` (la ligne avec `toFixed(2)` ; laisser `toFixed(0)` mais formater avec virgule si décimales inutiles — un entier reste « 85 € »).

## 5. Erreurs silencieuses — afficher un message à l'utilisateur

Dans tous les endroits où un `catch` vide ou un `.catch(() => ...)` avale une erreur d'écriture (action utilisateur), afficher un message d'erreur en français dans l'UI (bandeau ou texte rouge près de l'action, pas de `alert()`). Fichiers concernés :
- `src/views/FacturationView.tsx` → `togglePayee` (catch ligne ~113)
- `src/components/PromotionsManager.tsx` → 2 catch (~132, ~141)
- `src/views/AgendaView.tsx` → catch ~210
- `src/views/AlertesView.tsx` → 2 catch (~203, ~215)
- `src/views/NewsletterView.tsx` → catch ~104
- `src/views/DashboardView.tsx` → catch ~257

Les `.catch(() => setX([]))` sur des chargements secondaires (listes déroulantes) peuvent rester silencieux, ne les modifie pas.

## 6. Bug — bouton « Marquer payée » reste grisé

Dans `src/views/FacturationView.tsx`, `togglePayee` : remettre `togglingId` à `null` aussi en cas de succès (utiliser `finally`).

## 7. Robustesse — réponse non-JSON de l'API

Dans `src/lib/api.ts` : entourer `response.json()` d'un try/catch. Si le parsing échoue, lever `ApiError` avec un message français clair : « Le serveur a renvoyé une réponse inattendue (erreur {status}). Réessaie dans un instant. »

## 8. Donnée partagée — date du dernier envoi newsletter

La date du dernier envoi de newsletter est stockée en `localStorage` (`LAST_NEWSLETTER_KEY` dans `src/views/NewsletterView.tsx` et lue dans `src/views/AlertesView.tsx`). Problème : invisible pour l'autre utilisateur, perdue en changeant d'appareil. La stocker dans Airtable à la place, en réutilisant le mécanisme existant de la table « Alertes lues » (`tblqKRi9GGYhxdXM3`, endpoint `resource=dismissed-alerts` dans `api/prestations.ts`) : enregistrer une clé du type `newsletter-sent:<ISO date>` ou ajouter une ressource dédiée si plus propre. Supprimer l'usage de `localStorage` pour cette donnée (le `localStorage` de la sidebar peut rester, c'est une préférence d'affichage locale).

## 9. Harmonisation — format des dates

Dans `src/views/FacturationView.tsx`, la fonction locale `formatDate` affiche « 19 juil. 2026 ». Remplacer par le format JJ/MM/AAAA (`toLocaleDateString('fr-FR')` → « 19/07/2026 ») pour respecter la spec. Vérifier qu'aucune autre vue tabulaire n'utilise un autre format (les formats naturels type « samedi 19 juillet à 14h » dans l'agenda/dashboard sont voulus, ne pas les toucher).

## Vérification finale

1. `npm run build` → zéro erreur.
2. `npm run lint` → zéro erreur.
3. Résumer les fichiers modifiés et me rappeler les 2 actions manuelles restantes :
   - Dashboard Clerk → Restrictions → passer les inscriptions en mode « Restricted ».
   - Ajouter `ALLOWED_USER_IDS` et `VERCEL_URL_ORIGIN` dans les variables d'environnement Vercel (et `.env.local`).
