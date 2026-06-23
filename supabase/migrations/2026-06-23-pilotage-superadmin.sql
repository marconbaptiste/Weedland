-- ============================================================================
-- Migration — Pilotage super-admin : abonnement / période d'essai + messagerie.
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

-- 1. Abonnement & période d'essai sur les magasins -------------------------
alter table public.magasins
  add column if not exists abonnement text not null default 'essai'
  check (abonnement in ('essai', 'actif', 'suspendu'));
alter table public.magasins
  add column if not exists essai_fin date default (current_date + 14);

-- Les magasins existants ne sont pas bloqués : on les passe « actif ».
update public.magasins set abonnement = 'actif' where abonnement = 'essai';

-- 2. Messagerie / doléances (admin de magasin <-> super-admin) --------------
create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  magasin_id    uuid not null references public.magasins (id) on delete cascade,
  auteur_id     uuid references public.users (id) on delete set null,
  de_superadmin boolean not null default false,
  contenu       text not null,
  lu            boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_messages_magasin on public.messages (magasin_id, created_at);

alter table public.messages enable row level security;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (public.est_superadmin() or (public.est_membre() and magasin_id = public.mon_magasin()));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    (public.est_superadmin() and de_superadmin = true)
    or (public.est_membre() and magasin_id = public.mon_magasin() and de_superadmin = false)
  );

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated
  using (public.est_superadmin() or (public.est_membre() and magasin_id = public.mon_magasin()))
  with check (public.est_superadmin() or (public.est_membre() and magasin_id = public.mon_magasin()));
