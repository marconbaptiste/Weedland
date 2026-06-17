-- ============================================================================
-- Migration — Journées partagées (plusieurs employés en même temps, parts égales)
-- À exécuter dans l'éditeur SQL Supabase (après les migrations précédentes).
-- ============================================================================
-- Principe : une seule clôture (un seul CA) saisie par un employé. Les collègues
-- présents sont ajoutés dans caisse_partage. L'intéressement de chacun =
-- (CA ÷ nombre de personnes) × son %. Le CA n'est compté qu'une seule fois.
-- ============================================================================

-- 1. Co-participants d'une clôture (le propriétaire de la clôture n'y figure pas).
create table if not exists public.caisse_partage (
  caisse_id          uuid not null references public.caisse_jour (id) on delete cascade,
  employe_id         uuid not null references public.users (id) on delete restrict,
  heures_travaillees numeric(5, 2) not null default 0 check (heures_travaillees >= 0),
  created_at         timestamptz not null default now(),
  primary key (caisse_id, employe_id)
);
create index if not exists idx_caisse_partage_employe on public.caisse_partage (employe_id);

alter table public.caisse_partage enable row level security;

-- Vérifications croisées en SECURITY DEFINER pour éviter une récursion infinie
-- entre les policies de caisse_jour et caisse_partage.
create or replace function public.est_coparticipant(p_caisse uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.caisse_partage
                 where caisse_id = p_caisse and employe_id = auth.uid());
$$;

create or replace function public.est_proprietaire_caisse(p_caisse uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.caisse_jour
                 where id = p_caisse and employe_id = auth.uid());
$$;

-- Lecture : le propriétaire de la clôture, le co-participant lui-même, ou l'admin.
drop policy if exists partage_select on public.caisse_partage;
create policy partage_select on public.caisse_partage for select to authenticated
  using (employe_id = auth.uid() or public.est_admin() or public.est_proprietaire_caisse(caisse_id));

-- Écriture : uniquement le propriétaire de la clôture (ou l'admin).
drop policy if exists partage_insert on public.caisse_partage;
create policy partage_insert on public.caisse_partage for insert to authenticated
  with check (public.est_admin() or public.est_proprietaire_caisse(caisse_id));

drop policy if exists partage_delete on public.caisse_partage;
create policy partage_delete on public.caisse_partage for delete to authenticated
  using (public.est_admin() or public.est_proprietaire_caisse(caisse_id));

-- 2. Un co-participant doit pouvoir LIRE la clôture qu'il partage (pour son CA).
drop policy if exists caisse_select on public.caisse_jour;
create policy caisse_select on public.caisse_jour for select to authenticated
  using (employe_id = auth.uid() or public.est_admin() or public.est_coparticipant(id));

-- 3. v_ca_jour : ajoute nb_partageurs et divise l'intéressement par ce nombre.
drop view if exists public.v_interessement_employe;
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
  1 + (select count(*) from public.caisse_partage p where p.caisse_id = c.id) as nb_partageurs,
  coalesce(ch.avances, 0)        as avances,
  coalesce(ch.remboursements, 0) as remboursements,
  c.ventes_directes + coalesce(ch.avances, 0) - coalesce(ch.remboursements, 0) as ca_jour,
  c.cb + c.especes                                                             as encaissements,
  c.ventes_directes + coalesce(ch.remboursements, 0)                           as encaissements_attendus,
  (c.cb + c.especes) - (c.ventes_directes + coalesce(ch.remboursements, 0))    as ecart,
  round(
    (c.ventes_directes + coalesce(ch.avances, 0) - coalesce(ch.remboursements, 0))
      / (1 + (select count(*) from public.caisse_partage p where p.caisse_id = c.id))
      * c.pourcentage_interessement / 100,
    2
  ) as interessement
from public.caisse_jour c
left join public.v_chromes_jour ch
  on ch.date = c.date and ch.employe_id = c.employe_id;

-- 4. Lignes d'intéressement par employé : propriétaires + co-participants.
create view public.v_interessement_employe
with (security_invoker = on) as
-- Propriétaire de la clôture
select
  c.employe_id,
  c.caisse_id,
  c.date,
  true                         as est_proprietaire,
  c.heures_travaillees,
  c.pourcentage_interessement,
  c.ca_jour,
  c.encaissements,
  c.ecart,
  c.interessement
from public.v_ca_jour c
union all
-- Co-participants (% issu de leur fiche)
select
  p.employe_id,
  c.caisse_id,
  c.date,
  false                        as est_proprietaire,
  p.heures_travaillees,
  u.pourcentage_interessement,
  null::numeric                as ca_jour,
  null::numeric                as encaissements,
  null::numeric                as ecart,
  round(c.ca_jour / c.nb_partageurs * u.pourcentage_interessement / 100, 2) as interessement
from public.caisse_partage p
join public.v_ca_jour c on c.caisse_id = p.caisse_id
join public.users u on u.id = p.employe_id;

-- 5. Liste minimale des collègues (id + nom) pour le sélecteur de partage.
-- Vue NON security_invoker : contourne la RLS de users pour n'exposer que id+nom.
create or replace view public.v_collegues as
  select id, nom from public.users;

-- IMPORTANT : le DROP VIEW ci-dessus a retiré les droits SELECT ; on les
-- redonne explicitement (sinon Dashboard/Comptabilité/Historique lisent « vide »).
grant select on
  public.v_chromes_jour,
  public.v_ca_jour,
  public.v_solde_client,
  public.v_interessement_employe,
  public.v_collegues
to anon, authenticated;
