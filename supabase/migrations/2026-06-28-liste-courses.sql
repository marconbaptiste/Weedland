-- ============================================================================
-- Migration — Liste de courses (to-do d'achats) par magasin.
-- ----------------------------------------------------------------------------
-- Registre PARTAGÉ entre tous les membres du magasin (employé, admin,
-- superadmin) : chacun ajoute un article à acheter, le coche quand c'est fait,
-- ou le retire. Cloisonné par magasin via la RLS (`magasin_id = mon_magasin()`),
-- jamais accessible en anonyme.
-- À exécuter dans l'éditeur SQL Supabase (après la migration multi-magasin).
-- ============================================================================

create table if not exists public.liste_courses (
  id         uuid primary key default gen_random_uuid(),
  magasin_id uuid not null default public.mon_magasin() references public.magasins(id) on delete cascade,
  libelle    text not null,
  fait       boolean not null default false,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_liste_courses_magasin on public.liste_courses (magasin_id, fait, created_at);

alter table public.liste_courses enable row level security;

-- Lecture / écriture réservées aux membres du magasin (cloisonnement strict).
drop policy if exists courses_select on public.liste_courses;
create policy courses_select on public.liste_courses for select to authenticated
  using (public.est_membre() and magasin_id = public.mon_magasin());

drop policy if exists courses_insert on public.liste_courses;
create policy courses_insert on public.liste_courses for insert to authenticated
  with check (public.est_membre() and magasin_id = public.mon_magasin());

drop policy if exists courses_update on public.liste_courses;
create policy courses_update on public.liste_courses for update to authenticated
  using (public.est_membre() and magasin_id = public.mon_magasin())
  with check (public.est_membre() and magasin_id = public.mon_magasin());

drop policy if exists courses_delete on public.liste_courses;
create policy courses_delete on public.liste_courses for delete to authenticated
  using (public.est_membre() and magasin_id = public.mon_magasin());

-- created_by = l'auteur connecté, forcé côté serveur (jamais usurpable par le
-- client). Pas d'enjeu de sécurité (simple attribution d'affichage) mais on
-- garde la donnée fiable.
create or replace function public.liste_courses_auteur()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  return new;
end; $$;

drop trigger if exists trg_liste_courses_auteur on public.liste_courses;
create trigger trg_liste_courses_auteur
  before insert on public.liste_courses
  for each row execute function public.liste_courses_auteur();
