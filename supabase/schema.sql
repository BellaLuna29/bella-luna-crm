-- Bella Luna CRM — Postgres schema for Supabase
-- Mirrors the previous Airtable base (appybml05FLcP9M1j), replacing Airtable's
-- linked-record arrays with proper foreign keys and single-selects with check
-- constraints. Run this once in the Supabase SQL editor on a fresh project.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────
-- clients
-- ─────────────────────────────────────────────────────────────────────────
create table clients (
  id uuid primary key default gen_random_uuid(),
  nom_complet text not null,
  telephone text not null default '',
  email text not null default '',
  date_naissance date,
  genre text check (genre in ('Femme', 'Homme')),
  metier text not null default '',
  categorie_metier text,
  hobbies text not null default '',
  notes text not null default '',
  statut text not null default 'Nouvelle' check (statut in ('Nouvelle', 'Régulière', 'Inactive')),
  newsletter_ok boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- prestations (service catalogue)
-- ─────────────────────────────────────────────────────────────────────────
create table prestations (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  categorie text not null default '',
  duree text not null default '',
  prix numeric(10, 2) not null default 0,
  type text not null default ''
);

-- ─────────────────────────────────────────────────────────────────────────
-- promotions
-- ─────────────────────────────────────────────────────────────────────────
create table promotions (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  reduction numeric(4, 3) check (reduction >= 0 and reduction <= 1),
  active boolean not null default true,
  date_expiration date
);

-- ─────────────────────────────────────────────────────────────────────────
-- rendezvous
-- ─────────────────────────────────────────────────────────────────────────
create table rendezvous (
  id uuid primary key default gen_random_uuid(),
  date timestamptz not null,
  statut text not null default 'Confirmé' check (statut in ('Confirmé', 'Honoré', 'Annulé')),
  notes text not null default '',
  cliente_id uuid references clients (id) on delete set null,
  prestation_id uuid references prestations (id) on delete set null,
  rappel_sms_envoye boolean not null default false,
  questionnaire_envoye boolean not null default false,
  questionnaire_rempli boolean not null default false
);

create index rendezvous_cliente_id_idx on rendezvous (cliente_id);
create index rendezvous_date_idx on rendezvous (date);

-- ─────────────────────────────────────────────────────────────────────────
-- factures
-- ─────────────────────────────────────────────────────────────────────────
create table factures (
  id uuid primary key default gen_random_uuid(),
  date_facture date not null,
  montant numeric(10, 2) not null,
  payee boolean not null default false,
  cliente_id uuid references clients (id) on delete set null,
  rendezvous_id uuid references rendezvous (id) on delete set null,
  promo_id uuid references promotions (id) on delete set null,
  email_facture_envoye boolean not null default false,
  categorie_facture text not null default 'Commercial' check (categorie_facture in ('Commercial', 'Associatif ou formation')),
  description text not null default '',
  notes text not null default '',
  facture_pdf_url text,
  facture_pdf_nom text
);

create index factures_cliente_id_idx on factures (cliente_id);
create index factures_date_idx on factures (date_facture);

-- ─────────────────────────────────────────────────────────────────────────
-- depenses
-- ─────────────────────────────────────────────────────────────────────────
create table depenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  categorie text not null default '',
  description text not null,
  montant numeric(10, 2) not null,
  recurrente boolean not null default false,
  justificatif_url text,
  justificatif_nom text
);

create index depenses_date_idx on depenses (date);

-- ─────────────────────────────────────────────────────────────────────────
-- questionnaires
-- ─────────────────────────────────────────────────────────────────────────
create table questionnaires (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  categorie text not null default '',
  lien text not null,
  clientes_ciblees uuid[] not null default '{}'
);

-- ─────────────────────────────────────────────────────────────────────────
-- absences
-- ─────────────────────────────────────────────────────────────────────────
create table absences (
  id uuid primary key default gen_random_uuid(),
  libelle text not null,
  date_debut date not null,
  date_fin date not null,
  type text not null default 'Vacances' check (type in ('Vacances', 'Jour off', 'Autre'))
);

-- ─────────────────────────────────────────────────────────────────────────
-- alertes (manual alerts) + alertes_lues (dismissed automatic alerts)
-- ─────────────────────────────────────────────────────────────────────────
create table alertes (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  description text not null default '',
  date date,
  active boolean not null default true
);

create table alertes_lues (
  id uuid primary key default gen_random_uuid(),
  cle text not null unique
);

-- ─────────────────────────────────────────────────────────────────────────
-- newsletter_statut (single shared "last sent" timestamp)
-- ─────────────────────────────────────────────────────────────────────────
create table newsletter_statut (
  id uuid primary key default gen_random_uuid(),
  libelle text not null default 'Envoi newsletter',
  dernier_envoi timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- stock
-- ─────────────────────────────────────────────────────────────────────────
create table stock (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  quantite integer not null default 0,
  seuil_bas integer not null default 0,
  unite text not null default ''
);

-- ─────────────────────────────────────────────────────────────────────────
-- parametres (single-row settings: horaires + objectif CA)
-- ─────────────────────────────────────────────────────────────────────────
create table parametres (
  id uuid primary key default gen_random_uuid(),
  libelle text not null default 'Studio',
  lundi text not null default '',
  mardi text not null default '',
  mercredi text not null default '',
  jeudi text not null default '',
  vendredi text not null default '',
  samedi text not null default '',
  dimanche text not null default '',
  objectif_ca_mensuel numeric(10, 2)
);

-- ─────────────────────────────────────────────────────────────────────────
-- communications_log
-- ─────────────────────────────────────────────────────────────────────────
create table communications_log (
  id uuid primary key default gen_random_uuid(),
  contenu text not null,
  type text not null check (type in ('SMS', 'Email', 'Newsletter')),
  destinataires integer not null default 0,
  date_envoi timestamptz not null default now()
);

create index communications_log_date_envoi_idx on communications_log (date_envoi desc);

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security: all access goes through the Vercel API using the
-- service role key (which bypasses RLS), never the anon key from the
-- browser, so RLS stays enabled with no public policies.
-- ─────────────────────────────────────────────────────────────────────────
alter table clients enable row level security;
alter table prestations enable row level security;
alter table promotions enable row level security;
alter table rendezvous enable row level security;
alter table factures enable row level security;
alter table depenses enable row level security;
alter table questionnaires enable row level security;
alter table absences enable row level security;
alter table alertes enable row level security;
alter table alertes_lues enable row level security;
alter table newsletter_statut enable row level security;
alter table stock enable row level security;
alter table parametres enable row level security;
alter table communications_log enable row level security;
