-- ============================================================================
-- Migration — Fiches de paie + paramètres employeur (admin only)
-- ============================================================================

-- Paramètres généraux (clé/valeur JSONB) : sert à mémoriser l'employeur.
create table if not exists public.parametres (
  cle        text primary key,
  valeur     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Bulletins de paie : tout le contenu du bulletin est stocké en JSONB (data).
create table if not exists public.fiches_paie (
  id         uuid primary key default gen_random_uuid(),
  employe_id uuid not null references public.users (id) on delete restrict,
  mois       date not null,                 -- 1er jour du mois concerné
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employe_id, mois)
);
create index if not exists idx_fiches_paie_employe on public.fiches_paie (employe_id);

alter table public.parametres   enable row level security;
alter table public.fiches_paie  enable row level security;

-- Réservé à l'admin (données RH/employeur).
drop policy if exists parametres_admin on public.parametres;
create policy parametres_admin on public.parametres for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

drop policy if exists fiches_paie_admin on public.fiches_paie;
create policy fiches_paie_admin on public.fiches_paie for all to authenticated
  using (public.est_admin()) with check (public.est_admin());
