-- ============================================================================
-- Migration — Durcissement sécurité : escalade de privilèges & rôles.
-- ----------------------------------------------------------------------------
-- Corrige trois vecteurs d'élévation vers superadmin / hors-magasin :
--  1) handle_new_user faisait confiance au `role`/`pourcentage` du user_metadata
--     (contrôlé par le client au signup) → un email autorisé pouvait s'inscrire
--     en `superadmin`. On ne lit plus QUE l'allowlist `comptes_autorises`.
--  2) update direct `users.role = 'superadmin'` (un admin sur lui-même, ou un
--     admin promouvant un complice) → trigger BEFORE UPDATE qui borne les
--     changements de rôle/magasin (seul le superadmin élève en superadmin ;
--     personne ne s'auto-promeut ; changement de magasin réservé au superadmin).
--  3) policy `autorises_admin` n'encadrait pas la colonne `role` → un admin
--     pouvait écrire `role='superadmin'` dans l'allowlist. On contraint à
--     ('employe','admin') pour un admin non-superadmin.
-- Enfin, resserre la messagerie (réservée admin↔superadmin, pas tout employé).
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

-- 1) Le trigger ne lit plus le rôle/taux depuis le user_metadata (non fiable).
--    Source de vérité unique : l'allowlist comptes_autorises (posée par l'admin
--    via Comptes, ou par l'Edge Function en service_role).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v public.comptes_autorises%rowtype;
begin
  select * into v from public.comptes_autorises where email = lower(new.email);
  if v.email is null then
    return new; -- email non autorisé : pas de profil, donc aucun accès.
  end if;
  insert into public.users (id, nom, role, pourcentage_interessement, magasin_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nom', split_part(new.email, '@', 1)),
    coalesce(v.role, 'employe'),               -- plus jamais le metadata client
    coalesce(v.pourcentage_interessement, 0),  -- idem
    v.magasin_id)
  on conflict (id) do nothing;
  return new;
end; $$;

-- 2) Garde-fou sur les UPDATE de `users` : empêche l'auto-promotion et toute
--    élévation en superadmin par un compte qui n'est pas déjà superadmin.
--    Les opérations service_role / éditeur SQL (auth.uid() null) passent : ce
--    sont des contextes backend de confiance, hors de portée du client.
create or replace function public.users_garde_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new; -- service_role / SQL : confiance.
  end if;

  -- Changement de rôle.
  if new.role is distinct from old.role then
    if public.est_superadmin() then
      null; -- le superadmin gère tous les rôles.
    elsif public.est_admin()
          and old.magasin_id = public.mon_magasin()
          and new.id <> auth.uid()                 -- jamais sur soi-même
          and new.role in ('employe', 'admin')     -- jamais vers superadmin
          and old.role in ('employe', 'admin') then -- jamais rétrograder un superadmin
      null; -- un admin peut basculer employe<->admin dans son magasin.
    else
      raise exception 'Changement de rôle non autorisé';
    end if;
  end if;

  -- Changement de magasin : réservé au superadmin (mode pilote).
  if new.magasin_id is distinct from old.magasin_id and not public.est_superadmin() then
    raise exception 'Changement de magasin réservé au super-admin';
  end if;

  return new;
end; $$;

drop trigger if exists trg_users_garde_role on public.users;
create trigger trg_users_garde_role
  before update on public.users
  for each row execute function public.users_garde_role();

-- 3) L'allowlist : un admin non-superadmin ne peut autoriser que employe/admin.
drop policy if exists autorises_admin on public.comptes_autorises;
create policy autorises_admin on public.comptes_autorises for all to authenticated
  using (public.est_superadmin() or (public.est_admin() and magasin_id = public.mon_magasin()))
  with check (
    public.est_superadmin()
    or (public.est_admin() and magasin_id = public.mon_magasin()
        and role in ('employe', 'admin'))
  );

-- 4) Messagerie (doléances admin↔superadmin) : réservée à l'admin du magasin et
--    au superadmin — un employé lambda ne doit ni écrire au support ni altérer
--    l'historique des messages.
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    (public.est_superadmin() and de_superadmin = true)
    or (public.est_admin() and magasin_id = public.mon_magasin() and de_superadmin = false)
  );

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated
  using (public.est_superadmin() or (public.est_admin() and magasin_id = public.mon_magasin()))
  with check (public.est_superadmin() or (public.est_admin() and magasin_id = public.mon_magasin()));
