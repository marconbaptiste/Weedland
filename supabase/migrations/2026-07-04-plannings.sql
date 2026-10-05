-- ============================================================================
-- Plannings — présentiel des employés (créneaux de présence).
-- ----------------------------------------------------------------------------
-- Chaque créneau = une ligne (employé, date, heure début, heure fin). Plusieurs
-- employés le même jour/heure = plusieurs lignes → les chevauchements (présence
-- simultanée) sont naturellement gérés.
--
-- Sécurité : cloisonné par magasin. Lecture par les membres (les employés voient
-- le planning) ; écriture réservée à l'admin du magasin.
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

create table if not exists public.plannings (
  id         bigint generated always as identity primary key,
  magasin_id uuid not null default public.mon_magasin() references public.magasins(id) on delete cascade,
  employe_id uuid not null references public.users(id) on delete cascade,
  date       date not null,
  debut      time not null,
  fin        time not null,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists idx_plannings on public.plannings (magasin_id, date);

alter table public.plannings enable row level security;

-- Lecture : membres du magasin.
drop policy if exists plannings_select on public.plannings;
create policy plannings_select on public.plannings for select to authenticated
  using (public.est_membre() and magasin_id = public.mon_magasin());

-- Écriture (créer / modifier / supprimer) : admin du magasin uniquement.
drop policy if exists plannings_admin on public.plannings;
create policy plannings_admin on public.plannings for all to authenticated
  using (public.est_admin() and magasin_id = public.mon_magasin())
  with check (public.est_admin() and magasin_id = public.mon_magasin());
