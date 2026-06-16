-- ============================================================================
-- Migration — Comptabilité : charges et fournisseurs mensuels (admin only)
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

create table if not exists public.charges (
  id         uuid primary key default gen_random_uuid(),
  libelle    text not null default '',
  montant    numeric(10, 2) not null default 0,
  mois       date not null,            -- 1er jour du mois concerné
  created_at timestamptz not null default now()
);
create index if not exists idx_charges_mois on public.charges (mois);

create table if not exists public.fournisseurs (
  id         uuid primary key default gen_random_uuid(),
  libelle    text not null default '',
  montant    numeric(10, 2) not null default 0,
  mois       date not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_fournisseurs_mois on public.fournisseurs (mois);

alter table public.charges      enable row level security;
alter table public.fournisseurs enable row level security;

-- Données financières : réservées à l'admin (lecture + écriture).
drop policy if exists charges_admin on public.charges;
create policy charges_admin on public.charges for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

drop policy if exists fournisseurs_admin on public.fournisseurs;
create policy fournisseurs_admin on public.fournisseurs for all to authenticated
  using (public.est_admin()) with check (public.est_admin());
