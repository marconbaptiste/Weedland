-- Migration — Inscription self-service robuste (audit « parcours autonome »).
--
-- Problèmes fermés :
--  1. `creer-employe` (action inscription) consommait le code AVANT de créer le
--     compte : si `auth.admin.createUser` échouait (email déjà connu de Supabase
--     Auth — ex. 1re connexion Google sans profil —, mot de passe refusé, réseau),
--     le magasin et l'allowlist restaient orphelins, le code était brûlé et
--     l'email verrouillé (« déjà utilisé ») : impasse sans intervention SQL.
--     → `rendre_code_inscription` (service_role) restitue le code lors du
--       rollback fait par l'Edge Function.
--  2. Un compte Supabase Auth qui existe déjà (Google) mais n'a pas de profil :
--     le trigger `handle_new_user` ne rejoue jamais. → `reclamer_profil()`,
--     appelable par le compte connecté lui-même : crée son profil SI ET SEULEMENT
--     SI son email (celui de son JWT, donc prouvé) figure dans `comptes_autorises`.
--     Le rôle/magasin/taux viennent de l'allowlist, jamais du client.
--     Sert aussi quand un admin autorise l'email d'un collègue qui s'était déjà
--     connecté avec Google avant d'être autorisé.
--  3. `auth_email_existe` (service_role) : permet à l'Edge Function de savoir si
--     un email est déjà connu de Supabase Auth sans exposer `auth.users`.
--
-- 🔒 Sécurité : `reclamer_profil` n'accepte aucun paramètre (l'identité vient
-- de auth.uid() / auth.users), insère via SECURITY DEFINER (le trigger
-- `users_garde_role` passe : il n'exige rien quand la fonction s'exécute sous
-- le propriétaire — on force le contexte en le vérifiant explicitement ici :
-- un compte ne peut créer QUE son propre profil, avec le rôle de l'allowlist
-- borné à employe/admin). Les deux autres fonctions sont réservées au
-- service_role (jamais anon/authenticated).

create or replace function public.rendre_code_inscription(p_code text)
returns void language sql security definer set search_path = public as $$
  update public.codes_inscription
     set utilisations = greatest(utilisations - 1, 0)
   where code = p_code;
$$;
revoke execute on function public.rendre_code_inscription(text) from public, anon, authenticated;
grant execute on function public.rendre_code_inscription(text) to service_role;

create or replace function public.auth_email_existe(p_email text)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from auth.users where lower(email) = lower(btrim(p_email)));
$$;
revoke execute on function public.auth_email_existe(text) from public, anon, authenticated;
grant execute on function public.auth_email_existe(text) to service_role;

create or replace function public.reclamer_profil()
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_nom text;
  v public.comptes_autorises%rowtype;
begin
  if v_uid is null then
    return false;
  end if;
  -- Déjà un profil : rien à faire.
  if exists (select 1 from public.users where id = v_uid) then
    return true;
  end if;
  -- Email PROUVÉ seulement : jamais de profil pour une inscription email/mot de
  -- passe non confirmée (squat d'un email autorisé via /auth/v1/signup).
  select lower(email), coalesce(raw_user_meta_data ->> 'nom', raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name')
    into v_email, v_nom
    from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then
    return false;
  end if;
  select * into v from public.comptes_autorises where email = v_email;
  if v.email is null then
    return false; -- non autorisé : aucun profil, aucun accès.
  end if;
  insert into public.users (id, nom, role, pourcentage_interessement, magasin_id, email)
  values (
    v_uid,
    coalesce(nullif(btrim(v_nom), ''), split_part(v_email, '@', 1)),
    case when v.role in ('employe', 'admin') then v.role else 'employe' end, -- jamais superadmin par ce chemin
    coalesce(v.pourcentage_interessement, 0),
    v.magasin_id,
    v_email)
  on conflict (id) do nothing;
  return true;
end; $$;
revoke execute on function public.reclamer_profil() from public, anon;
grant execute on function public.reclamer_profil() to authenticated, service_role;

-- Le trigger anti-escalade `users_garde_role` refuse un INSERT par un compte
-- authentifié sans profil (auth.uid() non null, pas admin). On l'assouplit pour
-- le SEUL cas « je crée mon propre profil, non superadmin » — le contenu vient
-- de reclamer_profil (allowlist), et un INSERT direct par PostgREST reste
-- impossible : la policy users_admin_insert exige est_admin()/est_superadmin().
create or replace function public.users_garde_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new; -- service_role / éditeur SQL / trigger signup : contexte backend de confiance.
  end if;

  if tg_op = 'INSERT' then
    if public.est_superadmin() then
      return new;
    elsif public.est_admin()
          and new.magasin_id = public.mon_magasin()
          and new.role in ('employe', 'admin') then
      return new;
    elsif new.id = auth.uid()
          and new.role in ('employe', 'admin')
          and not exists (select 1 from public.users where id = auth.uid()) then
      return new; -- reclamer_profil() : son propre profil, jamais superadmin.
    else
      raise exception 'Création de profil non autorisée';
    end if;
  end if;

  -- L'identifiant d'un profil n'est JAMAIS modifiable par un client : sinon un
  -- admin pouvait réattribuer la ligne du superadmin (en pilotage dans son
  -- magasin) à un compte à lui (pentest H1).
  if new.id is distinct from old.id then
    raise exception 'Identifiant non modifiable';
  end if;

  if new.role is distinct from old.role then
    if public.est_superadmin() then
      null;
    elsif public.est_admin()
          and old.magasin_id = public.mon_magasin()
          and new.id <> auth.uid()
          and new.role in ('employe', 'admin')
          and old.role in ('employe', 'admin') then
      null;
    else
      raise exception 'Changement de rôle non autorisé';
    end if;
  end if;

  if new.magasin_id is distinct from old.magasin_id and not public.est_superadmin() then
    raise exception 'Changement de magasin réservé au super-admin';
  end if;

  return new;
end; $$;
