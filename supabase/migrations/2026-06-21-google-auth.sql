-- ============================================================================
-- Migration — Google Auth : barrière d'accès par allowlist + verrouillage des
-- registres partagés.
-- ----------------------------------------------------------------------------
-- Sans cette barrière, activer Google laisserait N'IMPORTE QUEL compte Google
-- se connecter et lire les données clients (RGPD). Ici :
--   * un profil n'est créé QUE pour un email pré-autorisé par l'admin ;
--   * les registres partagés (clients, chromes, promos, stocks) ne sont
--     lisibles que par un « membre » = quelqu'un qui possède un profil.
-- À exécuter dans l'éditeur SQL Supabase (après les migrations précédentes).
-- ============================================================================

-- 1. Allowlist des emails autorisés (gérée par l'admin dans Comptes).
create table if not exists public.comptes_autorises (
  email                     text primary key,
  role                      text not null default 'employe',
  pourcentage_interessement numeric(5, 2) not null default 0,
  created_at                timestamptz not null default now()
);
alter table public.comptes_autorises enable row level security;
drop policy if exists autorises_admin on public.comptes_autorises;
create policy autorises_admin on public.comptes_autorises for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- 2. Seed : on autorise les comptes déjà existants (ils gardent leur accès).
insert into public.comptes_autorises (email, role, pourcentage_interessement)
select lower(au.email), pu.role, pu.pourcentage_interessement
from auth.users au
join public.users pu on pu.id = au.id
where au.email is not null
on conflict (email) do nothing;

-- 3. « Membre » = possède un profil public.users (donc autorisé).
create or replace function public.est_membre()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid());
$$;

-- 4. Le profil n'est créé QUE pour un email pré-autorisé (sinon aucun accès).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v public.comptes_autorises%rowtype;
begin
  select * into v from public.comptes_autorises where email = lower(new.email);
  if v.email is null then
    return new; -- email non autorisé : pas de profil, donc pas d'accès
  end if;
  insert into public.users (id, nom, role, pourcentage_interessement)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nom', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', v.role, 'employe'),
    coalesce((new.raw_user_meta_data ->> 'pourcentage_interessement')::numeric, v.pourcentage_interessement, 0)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 5. Verrouillage des registres partagés : réservés aux membres (profil existant).
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated
  using (public.est_membre());
drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients for insert to authenticated
  with check (public.est_membre());

drop policy if exists chromes_select on public.chromes;
create policy chromes_select on public.chromes for select to authenticated
  using (public.est_membre());

drop policy if exists promos_select on public.promos;
create policy promos_select on public.promos for select to authenticated
  using (public.est_membre());

drop policy if exists stocks_select on public.stocks;
create policy stocks_select on public.stocks for select to authenticated
  using (public.est_membre());
drop policy if exists stocks_insert on public.stocks;
create policy stocks_insert on public.stocks for insert to authenticated
  with check (public.est_membre());
drop policy if exists stocks_update on public.stocks;
create policy stocks_update on public.stocks for update to authenticated
  using (public.est_membre()) with check (public.est_membre());
