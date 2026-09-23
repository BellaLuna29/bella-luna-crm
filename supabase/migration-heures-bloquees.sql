-- Blocage d'heures et récurrence dans l'agenda
-- ---------------------------------------------------------------------------
-- À exécuter une seule fois dans Supabase → SQL Editor → Run.
-- Sans erreur si relancé : tout est en "if not exists" / "drop ... if exists".
--
-- Avant : une absence bloquait forcément une journée entière ou une demi-journée.
-- Après : elle peut ne bloquer qu'une plage horaire (12:00–14:00), et se répéter
-- chaque semaine le même jour (pause déjeuner, créneau perso hebdomadaire).

-- 1. Plage horaire optionnelle. Les deux colonnes nulles = comportement actuel
--    (journée entière, ou demi-journée si demi_journee est renseigné).
alter table absences add column if not exists heure_debut time;
alter table absences add column if not exists heure_fin time;

-- 2. Récurrence hebdomadaire optionnelle.
--    jour_semaine suit getDay() de JavaScript : 0 = dimanche … 6 = samedi.
alter table absences add column if not exists recurrence text;
alter table absences add column if not exists jour_semaine integer;

-- 3. Garde-fous : une récurrence hebdomadaire a besoin de son jour, et une
--    plage horaire d'un début strictement avant sa fin.
alter table absences drop constraint if exists absences_recurrence_check;
alter table absences add constraint absences_recurrence_check check (
  (recurrence is null and jour_semaine is null)
  or (recurrence = 'hebdomadaire' and jour_semaine between 0 and 6)
);

alter table absences drop constraint if exists absences_plage_horaire_check;
alter table absences add constraint absences_plage_horaire_check check (
  (heure_debut is null and heure_fin is null)
  or (heure_debut is not null and heure_fin is not null and heure_debut < heure_fin)
);

-- 4. Le calcul des disponibilités relit les absences à chaque consultation du
--    lien de réservation : un index sur la récurrence évite de balayer la table
--    pour retrouver les répétitions.
create index if not exists absences_recurrence_idx on absences (recurrence, jour_semaine);
