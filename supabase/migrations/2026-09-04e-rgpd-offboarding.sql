-- Migration — RGPD & offboarding (audit légal + robustesse H3 + pentest INFO).
--
--  1. Consentement des clients finaux (carte de fidélité) : deux consentements
--     distincts — carte (obligatoire) et offres (facultatif) — horodatés et
--     versionnés. `inscription_client_publique` prend un 4ᵉ argument p_offres.
--  2. Droit à l'effacement sans casser la comptabilité : `client_anonymiser`
--     (admin) efface surnom/téléphone/adresse/description/push/faveurs, rote le
--     token de carte, conserve les chromes (obligation comptable, 10 ans).
--  3. Preuve d'acceptation des CGV/CGU à l'inscription d'un magasin :
--     `magasins.cgv_version` / `cgv_acceptees_le` (posées par l'Edge Function).
--  4. Offboarding employé : `users.actif` — un compte désactivé perd TOUT accès
--     immédiatement (est_membre()/est_admin() le vérifient ; la RLS de toutes
--     les tables repose sur ces deux fonctions), en plus du bannissement Auth
--     posé par l'Edge Function (action desactiver-compte). Avant : « Retirer
--     l'accès » ne retirait que l'allowlist, l'ex-employé gardait tout.
--  5. Fin de contrat / art. 28.3.g : `magasin_purger(p_id)` (service_role)
--     supprime TOUTES les données d'un magasin dans l'ordre des dépendances
--     (l'ancienne suppression oubliait la moitié des tables et échouait sur
--     les FK). Les fichiers Storage et le customer Stripe sont traités par
--     l'Edge Function.

-- 1) Consentements clients -----------------------------------------------------
alter table public.clients
  add column if not exists consent_offres boolean not null default false,
  add column if not exists consent_at timestamptz,
  add column if not exists consent_version text;

drop function if exists public.inscription_client_publique(uuid, text, text);
create or replace function public.inscription_client_publique(
  p_magasin uuid, p_surnom text, p_telephone text, p_offres boolean default false
) returns uuid
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_id uuid; v_ouvert boolean; v_count int;
  v_surnom text := left(btrim(coalesce(p_surnom, '')), 40);
  v_tel text := btrim(coalesce(p_telephone, ''));
begin
  select inscriptions_ouvertes into v_ouvert from public.magasins where id = p_magasin;
  if v_ouvert is null then raise exception 'Magasin inconnu.'; end if;
  if not v_ouvert then raise exception 'Les inscriptions sont fermées pour ce magasin.'; end if;
  if v_surnom = '' then raise exception 'Surnom requis.'; end if;
  if v_tel = '' then raise exception 'Téléphone requis.'; end if;
  if length(public.normaliser_tel(v_tel)) < 6 then
    raise exception 'Numéro de téléphone invalide.';
  end if;

  select case when inscriptions_jour_date = current_date then inscriptions_jour else 0 end
    into v_count from public.magasins where id = p_magasin;
  if v_count >= 200 then
    raise exception 'Trop d''inscriptions aujourd''hui pour ce magasin, réessayez demain.';
  end if;

  insert into public.clients (surnom, telephone, magasin_id, consent_offres, consent_at, consent_version)
  values (v_surnom, v_tel, p_magasin, coalesce(p_offres, false), now(), 'carte-2026-09')
  on conflict (magasin_id, public.normaliser_tel(telephone))
    where (telephone is not null and telephone <> '')
  do nothing
  returning id into v_id;

  if v_id is null then
    return null; -- déjà inscrit : ni fuite d'UUID, ni incrément de compteur
  end if;

  update public.magasins
    set inscriptions_jour = case when inscriptions_jour_date = current_date then inscriptions_jour + 1 else 1 end,
        inscriptions_jour_date = current_date
    where id = p_magasin;

  return v_id;
end; $function$;
revoke execute on function public.inscription_client_publique(uuid, text, text, boolean) from public;
grant execute on function public.inscription_client_publique(uuid, text, text, boolean) to anon, authenticated;

-- v_solde_client expose le consentement offres (info pour le personnel : ne pas
-- démarcher un client qui a refusé).
create or replace view public.v_solde_client
with (security_invoker = on) as
select
  cl.id  as client_id,
  cl.surnom,
  cl.description,
  coalesce(sum(ch.montant) filter (where ch.type = 'avance'), 0)
    - coalesce(sum(ch.montant) filter (where ch.type = 'remboursement'), 0) as solde,
  cl.telephone,
  cl.adresse,
  cl.consent_offres
from public.clients cl
left join public.chromes ch on ch.client_id = cl.id
group by cl.id, cl.surnom, cl.description, cl.telephone, cl.adresse, cl.consent_offres;
grant select on public.v_solde_client to authenticated;
revoke select on public.v_solde_client from anon;

-- 2) Anonymisation d'un client (droit à l'effacement) ---------------------------
create or replace function public.client_anonymiser(p_client uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_mag uuid := public.mon_magasin();
begin
  if not public.est_admin() or v_mag is null then raise exception 'non autorisé'; end if;
  if not exists (select 1 from public.clients where id = p_client and magasin_id = v_mag) then
    raise exception 'Client introuvable';
  end if;
  delete from public.push_abonnements where client_id = p_client;
  delete from public.promos where client_id = p_client;
  update public.commandes set adresse_livraison = null, note = null where client_id = p_client;
  update public.clients
     set surnom = 'Client supprimé #' || left(replace(p_client::text, '-', ''), 6),
         description = null,
         telephone = null,
         adresse = null,
         consent_offres = false,
         fid_token = gen_random_uuid(),
         fid_token_maj = now()
   where id = p_client;
end; $$;
revoke execute on function public.client_anonymiser(uuid) from public, anon;
grant execute on function public.client_anonymiser(uuid) to authenticated;

-- 3) Preuve d'acceptation des CGV --------------------------------------------------
alter table public.magasins
  add column if not exists cgv_version text,
  add column if not exists cgv_acceptees_le timestamptz;

-- 4) Comptes désactivés ----------------------------------------------------------------
alter table public.users add column if not exists actif boolean not null default true;

create or replace function public.est_membre()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and actif);
$$;
create or replace function public.est_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and actif and role in ('admin','superadmin'));
$$;
create or replace function public.est_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and actif and role = 'superadmin');
$$;
-- Un admin ne peut désactiver ni un superadmin ni lui-même (garde dans le
-- trigger users_garde_role : `actif` ne se change pas sur soi-même).
create or replace function public.users_garde_actif()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.actif is distinct from old.actif then
    if new.id = auth.uid() then raise exception 'Impossible de modifier son propre statut'; end if;
    if old.role = 'superadmin' and not public.est_superadmin() then raise exception 'non autorisé'; end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_users_garde_actif on public.users;
create trigger trg_users_garde_actif
  before update on public.users
  for each row execute function public.users_garde_actif();

-- 5) Purge complète d'un magasin (service_role) -----------------------------------------
create or replace function public.magasin_purger(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t text;
  -- Ordre : enfants d'abord (FK restrict vers users/clients/caisse_jour).
  tables text[] := array[
    'push_abonnements', 'fidelite_evenements', 'chrome_evenements', 'stock_mouvements',
    'commandes', 'promotions', 'plannings', 'liste_courses', 'caisse_partage',
    'fiches_paie', 'paiements_employes', 'chromes', 'promos', 'clients',
    'caisse_jour', 'stocks', 'charges', 'fournisseurs', 'parametres', 'messages', 'veille'
  ];
begin
  if auth.uid() is not null then raise exception 'réservé au backend'; end if;
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where magasin_id = $1', t) using p_id;
    end if;
  end loop;
  delete from public.comptes_autorises where magasin_id = p_id;
  delete from public.users where magasin_id = p_id;
  delete from public.magasins where id = p_id;
end; $$;
revoke execute on function public.magasin_purger(uuid) from public, anon, authenticated;
grant execute on function public.magasin_purger(uuid) to service_role;
