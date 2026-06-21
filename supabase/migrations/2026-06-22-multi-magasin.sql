-- ============================================================================
-- Migration — MULTI-MAGASIN (Phase 1 : fondation)
-- ----------------------------------------------------------------------------
-- Ordre important : on ajoute les colonnes magasin_id AVANT de créer les
-- fonctions qui les référencent (mon_magasin), puis on pose les défauts/NOT NULL.
-- Données existantes rattachées à un magasin « Weedland ». À lancer AVANT le
-- déploiement du nouveau code. Idempotent autant que possible.
-- ============================================================================

-- 1. Table des magasins -------------------------------------------------------
create table if not exists public.magasins (
  id         uuid primary key default gen_random_uuid(),
  nom        text not null,
  actif      boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.magasins enable row level security;

insert into public.magasins (nom)
select 'Weedland'
where not exists (select 1 from public.magasins);

-- 2. Colonnes magasin_id (nullable) + backfill -------------------------------
do $$
declare
  m uuid := (select id from public.magasins order by created_at limit 1);
  t text;
begin
  execute 'alter table public.users add column if not exists magasin_id uuid references public.magasins(id)';
  execute format('update public.users set magasin_id = %L where magasin_id is null', m);

  execute 'alter table public.comptes_autorises add column if not exists magasin_id uuid references public.magasins(id)';
  execute format('update public.comptes_autorises set magasin_id = %L where magasin_id is null', m);

  foreach t in array array[
    'clients','caisse_jour','chromes','promos','stocks','charges','fournisseurs','paiements_employes'
  ] loop
    execute format('alter table public.%I add column if not exists magasin_id uuid references public.magasins(id)', t);
    execute format('update public.%I set magasin_id = %L where magasin_id is null', t, m);
    execute format('create index if not exists idx_%s_magasin on public.%I (magasin_id)', t, t);
  end loop;
end $$;

-- 3. Fonctions d'aide (les colonnes existent maintenant) ----------------------
create or replace function public.mon_magasin()
returns uuid language sql stable security definer set search_path = public as $$
  select magasin_id from public.users where id = auth.uid();
$$;

create or replace function public.est_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'superadmin');
$$;

create or replace function public.est_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role in ('admin','superadmin'));
$$;

-- 4. Défauts + NOT NULL (mon_magasin existe maintenant) -----------------------
do $$
declare
  m uuid := (select id from public.magasins order by created_at limit 1);
  t text;
begin
  execute format('alter table public.comptes_autorises alter column magasin_id set default %L', m);
  execute 'alter table public.comptes_autorises alter column magasin_id set not null';

  foreach t in array array[
    'clients','caisse_jour','chromes','promos','stocks','charges','fournisseurs','paiements_employes'
  ] loop
    execute format('alter table public.%I alter column magasin_id set default public.mon_magasin()', t);
    execute format('alter table public.%I alter column magasin_id set not null', t);
  end loop;
end $$;

-- 5. Le superadmin (l'exploitant) — adapte l'email si besoin ------------------
update public.users
set role = 'superadmin'
where id = (select id from auth.users where lower(email) = 'marcon.baptist@gmail.com');

-- 6. Le trigger assigne le magasin depuis l'allowlist -------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v public.comptes_autorises%rowtype;
begin
  select * into v from public.comptes_autorises where email = lower(new.email);
  if v.email is null then return new; end if;
  insert into public.users (id, nom, role, pourcentage_interessement, magasin_id)
  values (new.id,
    coalesce(new.raw_user_meta_data ->> 'nom', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data ->> 'role', v.role, 'employe'),
    coalesce((new.raw_user_meta_data ->> 'pourcentage_interessement')::numeric, v.pourcentage_interessement, 0),
    v.magasin_id)
  on conflict (id) do nothing;
  return new;
end; $$;

-- 7. RLS — cloisonnement par magasin -----------------------------------------
drop policy if exists magasins_select on public.magasins;
create policy magasins_select on public.magasins for select to authenticated
  using (public.est_superadmin() or id = public.mon_magasin());
drop policy if exists magasins_superadmin on public.magasins;
create policy magasins_superadmin on public.magasins for all to authenticated
  using (public.est_superadmin()) with check (public.est_superadmin());

drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (id = auth.uid() or public.est_superadmin()
         or (public.est_admin() and magasin_id = public.mon_magasin()));
drop policy if exists users_admin_insert on public.users;
create policy users_admin_insert on public.users for insert to authenticated
  with check (public.est_superadmin() or (public.est_admin() and magasin_id = public.mon_magasin()));
drop policy if exists users_admin_update on public.users;
create policy users_admin_update on public.users for update to authenticated
  using (public.est_superadmin() or (public.est_admin() and magasin_id = public.mon_magasin()))
  with check (public.est_superadmin() or (public.est_admin() and magasin_id = public.mon_magasin()));
drop policy if exists users_admin_delete on public.users;
create policy users_admin_delete on public.users for delete to authenticated
  using (public.est_superadmin() or (public.est_admin() and magasin_id = public.mon_magasin()));

drop policy if exists autorises_admin on public.comptes_autorises;
create policy autorises_admin on public.comptes_autorises for all to authenticated
  using (public.est_superadmin() or (public.est_admin() and magasin_id = public.mon_magasin()))
  with check (public.est_superadmin() or (public.est_admin() and magasin_id = public.mon_magasin()));

drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated
  using (public.est_membre() and magasin_id = public.mon_magasin());
drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients for insert to authenticated
  with check (public.est_membre() and magasin_id = public.mon_magasin());
drop policy if exists clients_admin_update on public.clients;
create policy clients_admin_update on public.clients for update to authenticated
  using (public.est_admin() and magasin_id = public.mon_magasin())
  with check (public.est_admin() and magasin_id = public.mon_magasin());
drop policy if exists clients_admin_delete on public.clients;
create policy clients_admin_delete on public.clients for delete to authenticated
  using (public.est_admin() and magasin_id = public.mon_magasin());

drop policy if exists caisse_select on public.caisse_jour;
create policy caisse_select on public.caisse_jour for select to authenticated
  using (magasin_id = public.mon_magasin()
         and (employe_id = auth.uid() or public.est_admin() or public.est_coparticipant(id)));
drop policy if exists caisse_insert on public.caisse_jour;
create policy caisse_insert on public.caisse_jour for insert to authenticated
  with check (magasin_id = public.mon_magasin() and (employe_id = auth.uid() or public.est_admin()));
drop policy if exists caisse_update on public.caisse_jour;
create policy caisse_update on public.caisse_jour for update to authenticated
  using (magasin_id = public.mon_magasin() and (employe_id = auth.uid() or public.est_admin()))
  with check (magasin_id = public.mon_magasin() and (employe_id = auth.uid() or public.est_admin()));
drop policy if exists caisse_delete on public.caisse_jour;
create policy caisse_delete on public.caisse_jour for delete to authenticated
  using (magasin_id = public.mon_magasin() and (employe_id = auth.uid() or public.est_admin()));

drop policy if exists chromes_select on public.chromes;
create policy chromes_select on public.chromes for select to authenticated
  using (public.est_membre() and magasin_id = public.mon_magasin());
drop policy if exists chromes_insert on public.chromes;
create policy chromes_insert on public.chromes for insert to authenticated
  with check (magasin_id = public.mon_magasin() and (employe_id = auth.uid() or public.est_admin()));
drop policy if exists chromes_update on public.chromes;
create policy chromes_update on public.chromes for update to authenticated
  using (magasin_id = public.mon_magasin() and (employe_id = auth.uid() or public.est_admin()))
  with check (magasin_id = public.mon_magasin() and (employe_id = auth.uid() or public.est_admin()));
drop policy if exists chromes_delete on public.chromes;
create policy chromes_delete on public.chromes for delete to authenticated
  using (magasin_id = public.mon_magasin() and (employe_id = auth.uid() or public.est_admin()));

drop policy if exists promos_select on public.promos;
create policy promos_select on public.promos for select to authenticated
  using (public.est_membre() and magasin_id = public.mon_magasin());
drop policy if exists promos_insert on public.promos;
create policy promos_insert on public.promos for insert to authenticated
  with check (magasin_id = public.mon_magasin() and (employe_id = auth.uid() or public.est_admin()));
drop policy if exists promos_update on public.promos;
create policy promos_update on public.promos for update to authenticated
  using (magasin_id = public.mon_magasin() and (employe_id = auth.uid() or public.est_admin()))
  with check (magasin_id = public.mon_magasin() and (employe_id = auth.uid() or public.est_admin()));
drop policy if exists promos_delete on public.promos;
create policy promos_delete on public.promos for delete to authenticated
  using (magasin_id = public.mon_magasin() and (employe_id = auth.uid() or public.est_admin()));

drop policy if exists stocks_select on public.stocks;
create policy stocks_select on public.stocks for select to authenticated
  using (public.est_membre() and magasin_id = public.mon_magasin());
drop policy if exists stocks_insert on public.stocks;
create policy stocks_insert on public.stocks for insert to authenticated
  with check (public.est_membre() and magasin_id = public.mon_magasin());
drop policy if exists stocks_update on public.stocks;
create policy stocks_update on public.stocks for update to authenticated
  using (public.est_membre() and magasin_id = public.mon_magasin())
  with check (public.est_membre() and magasin_id = public.mon_magasin());
drop policy if exists stocks_delete on public.stocks;
create policy stocks_delete on public.stocks for delete to authenticated
  using (public.est_admin() and magasin_id = public.mon_magasin());

drop policy if exists paiements_select on public.paiements_employes;
create policy paiements_select on public.paiements_employes for select to authenticated
  using (magasin_id = public.mon_magasin() and (employe_id = auth.uid() or public.est_admin()));
drop policy if exists paiements_admin_insert on public.paiements_employes;
create policy paiements_admin_insert on public.paiements_employes for insert to authenticated
  with check (public.est_admin() and magasin_id = public.mon_magasin());
drop policy if exists paiements_admin_update on public.paiements_employes;
create policy paiements_admin_update on public.paiements_employes for update to authenticated
  using (public.est_admin() and magasin_id = public.mon_magasin())
  with check (public.est_admin() and magasin_id = public.mon_magasin());
drop policy if exists paiements_admin_delete on public.paiements_employes;
create policy paiements_admin_delete on public.paiements_employes for delete to authenticated
  using (public.est_admin() and magasin_id = public.mon_magasin());

drop policy if exists charges_admin on public.charges;
create policy charges_admin on public.charges for all to authenticated
  using (public.est_admin() and magasin_id = public.mon_magasin())
  with check (public.est_admin() and magasin_id = public.mon_magasin());
drop policy if exists fournisseurs_admin on public.fournisseurs;
create policy fournisseurs_admin on public.fournisseurs for all to authenticated
  using (public.est_admin() and magasin_id = public.mon_magasin())
  with check (public.est_admin() and magasin_id = public.mon_magasin());
