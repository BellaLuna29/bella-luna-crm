# Migration Airtable → Supabase

Le backend a été entièrement réécrit pour utiliser Supabase (Postgres) au lieu
d'Airtable. Voici ce qu'il reste à faire côté infrastructure (actions que
Claude ne peut pas faire à ta place — création de compte, clés secrètes).

## 1. Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com), crée un compte si besoin, puis
   **New project** (le plan gratuit suffit pour démarrer).
2. Une fois le projet créé, ouvre **SQL Editor** dans le menu de gauche.
3. Colle le contenu de [`schema.sql`](./schema.sql) et exécute-le (bouton
   **Run**). Ça crée les 16 tables avec leurs relations.

## 2. Créer les buckets de stockage (fichiers joints)

Dans **Storage** (menu de gauche), crée deux buckets **publics** :

- `depenses-justificatifs` (PDF des justificatifs de dépenses)
- `factures-pdf` (PDF des factures)

Pour chacun : **New bucket** → coche **Public bucket** → Create.

## 3. Récupérer les clés et les mettre sur Vercel

Dans **Project Settings → API** sur Supabase, récupère :

- **Project URL** (ex. `https://xxxxxxxxxxxx.supabase.co`)
- **service_role key** (⚠️ pas la clé `anon` — celle-ci contourne la sécurité
  au niveau des lignes, à garder strictement côté serveur)

Sur [vercel.com](https://vercel.com), dans les Settings du projet
`bella-luna-crm` → **Environment Variables**, ajoute :

```
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Tu peux supprimer les anciennes variables `AIRTABLE_API_KEY` et
`AIRTABLE_BASE_ID` une fois la migration validée (elles ne sont plus lues par
le code, garde-les seulement si tu veux relancer le script de migration plus
tard).

## 4. Migrer les données existantes

Deux scripts sont disponibles — utilise celui qui correspond à ta situation.

### Option A — depuis les CSV déjà exportés (prêt tout de suite)

Le dossier [`BDD/`](../BDD) contient déjà un export CSV de chaque table
(fait manuellement depuis Airtable, ce qui ne consomme pas le quota API).
[`scripts/migrate-from-csv.mjs`](../scripts/migrate-from-csv.mjs) lit ces
fichiers et réécrit tout dans Supabase — **cette option ne dépend pas du
quota Airtable et peut tourner immédiatement** une fois les étapes 1-3
faites :

```bash
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
node scripts/migrate-from-csv.mjs
```

Points notables :
- Les dates/heures des CSV sont interprétées comme heure de Paris (le studio
  est à Quimper), converties explicitement en UTC — indépendant du fuseau
  horaire de la machine qui exécute le script.
- Les identifiants Airtable des enregistrements liés (cliente, prestation,
  promo...) ne sont pas dans le CSV — le script les reconstruit par
  correspondance de nom exact (nom complet de la cliente, nom de la
  prestation).
- Table **Cures** : non migrée. L'app calcule la progression des cures
  automatiquement à partir de l'historique des rendez-vous (elle n'a jamais
  lu cette table). Certaines cures historiques (Elodie Pennec, Nadège Le
  Bris) ont été suivies avec des rendez-vous enregistrés sur la prestation
  « Séance unique » plutôt que sur la prestation « Cure X séances » — le
  calcul automatique ne les détectera donc pas rétroactivement. Dis-le-moi
  si tu veux que je corrige ces rendez-vous historiques après la migration.
- Fichier **Collaborators** : ignoré, ce sont les accès à ta base Airtable
  (métadonnées de compte), pas des données de l'app.
- Lignes de rendez-vous totalement vides dans l'export (brouillons
  abandonnés) : ignorées automatiquement.

### Option B — depuis l'API Airtable (si tu préfères, une fois le quota revenu)

[`scripts/migrate-to-supabase.mjs`](../scripts/migrate-to-supabase.mjs) fait
la même chose mais lit directement l'API Airtable au lieu des CSV — utile si
tu modifies encore les données dans Airtable après l'export et veux la
version la plus à jour.

```bash
AIRTABLE_API_KEY=pat_... \
AIRTABLE_BASE_ID=appybml05FLcP9M1j \
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
node scripts/migrate-to-supabase.mjs
```

Les deux scripts sont ré-exécutables sans risque (ils vident les tables
Supabase avant chaque import).

**Limite connue (les deux options)** : les fichiers joints (PDF de factures,
justificatifs de dépenses) ne sont pas repris automatiquement — Airtable ne
les inclut pas dans un export CSV, et son API ne fournit qu'une URL signée
temporaire. Aucun des enregistrements actuels n'en a d'ailleurs (colonnes
vides dans l'export). À réattacher manuellement sur Supabase si besoin plus
tard.

## 5. Vérifier

Une fois les 4 étapes faites, l'app doit fonctionner normalement — aucune
autre modification n'est nécessaire côté frontend, les endpoints `/api/*`
renvoient exactement le même format JSON qu'avant.
