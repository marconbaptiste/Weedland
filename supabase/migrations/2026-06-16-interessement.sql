-- ============================================================================
-- Migration — Intéressement (% du CA) + heures travaillées
-- À exécuter dans l'éditeur SQL Supabase sur une base déjà créée.
-- (Sur une base neuve, schema.sql contient déjà ces colonnes.)
-- ============================================================================

-- 1. Taux par défaut sur la fiche employé.
alter table public.users
  add column if not exists pourcentage_interessement numeric(5, 2) not null default 0
  check (pourcentage_interessement >= 0);

-- 2. Heures travaillées + taux appliqué sur chaque clôture.
alter table public.caisse_jour
  add column if not exists heures_travaillees numeric(5, 2) not null default 0
  check (heures_travaillees >= 0);

alter table public.caisse_jour
  add column if not exists pourcentage_interessement numeric(5, 2) not null default 0
  check (pourcentage_interessement >= 0);

-- 3. Recréer la vue v_ca_jour avec heures, taux et intéressement calculé.
-- On la supprime d'abord : `create or replace view` interdit d'insérer de
-- nouvelles colonnes ailleurs qu'à la fin.
drop view if exists public.v_ca_jour;
create view public.v_ca_jour
with (security_invoker = on) as
select
  c.id          as caisse_id,
  c.date,
  c.employe_id,
  c.ventes_directes,
  c.cb,
  c.especes,
  c.fond_caisse,
  c.heures_travaillees,
  c.pourcentage_interessement,
  coalesce(ch.avances, 0)        as avances,
  coalesce(ch.remboursements, 0) as remboursements,
  c.ventes_directes + coalesce(ch.avances, 0) - coalesce(ch.remboursements, 0) as ca_jour,
  c.cb + c.especes                                                             as encaissements,
  c.ventes_directes + coalesce(ch.remboursements, 0)                           as encaissements_attendus,
  (c.cb + c.especes) - (c.ventes_directes + coalesce(ch.remboursements, 0))    as ecart,
  round(
    (c.ventes_directes + coalesce(ch.avances, 0) - coalesce(ch.remboursements, 0))
      * c.pourcentage_interessement / 100,
    2
  ) as interessement
from public.caisse_jour c
left join public.v_chromes_jour ch
  on ch.date = c.date and ch.employe_id = c.employe_id;

-- 4. Mettre à jour le trigger pour reprendre le taux passé à la création.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, nom, role, pourcentage_interessement)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nom', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'employe'),
    coalesce((new.raw_user_meta_data ->> 'pourcentage_interessement')::numeric, 0)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
