-- ============================================================================
-- Migration — Codes d'inscription gérés en base (générateur super-admin).
-- Remplace/complète le secret CODE_INSCRIPTION : le super-admin génère des codes
-- depuis la page Magasins ; l'Edge Function les valide ici.
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

create table if not exists public.codes_inscription (
  code         text primary key,
  libelle      text,
  actif        boolean not null default true,
  utilisations int not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.codes_inscription enable row level security;

-- Gestion réservée au super-admin (l'Edge Function lit via service_role).
drop policy if exists codes_superadmin on public.codes_inscription;
create policy codes_superadmin on public.codes_inscription for all to authenticated
  using (public.est_superadmin()) with check (public.est_superadmin());
