-- Autorise plusieurs plages de disponibilité pour un même jour.
-- Exemple : lundi 09:00–12:00 puis 17:00–19:00.
alter table public.disponibilites
  drop constraint if exists disponibilites_jour_semaine_key;
