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

Le script [`scripts/migrate-to-supabase.mjs`](../scripts/migrate-to-supabase.mjs)
lit tout depuis Airtable et réécrit dans Supabase (avec conversion des
identifiants et des relations). Il nécessite que le **quota API Airtable**
soit disponible (attends la réinitialisation mensuelle, ou upgrade ton plan
Airtable si tu veux migrer immédiatement).

Depuis la racine du projet :

```bash
AIRTABLE_API_KEY=pat_... \
AIRTABLE_BASE_ID=appybml05FLcP9M1j \
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
node scripts/migrate-to-supabase.mjs
```

Le script est ré-exécutable sans risque (il vide les tables Supabase avant
chaque import, donc relance-le si besoin pour resynchroniser).

**Limite connue** : les fichiers joints (PDF de factures, justificatifs de
dépenses) sont copiés par référence à l'URL Airtable d'origine, qui est une
URL signée et expire au bout de quelques heures. Si tu as des PDF importants
à conserver, il faudra les télécharger et les réuploader manuellement dans les
buckets Supabase créés à l'étape 2 — dis-le-moi si tu veux que j'écrive un
script dédié pour ça une fois le quota Airtable revenu.

## 5. Vérifier

Une fois les 4 étapes faites, l'app doit fonctionner normalement — aucune
autre modification n'est nécessaire côté frontend, les endpoints `/api/*`
renvoient exactement le même format JSON qu'avant.
