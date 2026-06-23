-- ============================================================================
-- Migration — Auto-inscription d'un client via QR public du magasin.
-- ----------------------------------------------------------------------------
-- Le magasin affiche au comptoir un QR (→ /rejoindre/<magasin_id>). Le client
-- le scanne sur SON téléphone, saisit un surnom (pseudonyme) + son téléphone,
-- valide, et obtient immédiatement sa carte de fidélité (/carte/<client_id>)
-- qu'il peut ajouter à son écran d'accueil. Bonus : +1 étoile à l'inscription.
--
-- inscription_client_publique() est SECURITY DEFINER et ouverte en anonyme :
--   - elle crée la fiche dans le BON magasin (passé en argument, pas de
--     mon_magasin() côté anon) ;
--   - elle DÉDUPLIQUE par (magasin, téléphone) : re-scanner ne crée pas de
--     doublon et ne re-crédite pas l'étoile bonus (anti-abus) ;
--   - le téléphone n'est jamais ré-exposé publiquement (fidelite_etat ne
--     renvoie que surnom/tampons/palier).
-- RGPD : téléphone recueilli avec le consentement explicite du client (case à
-- cocher côté formulaire), cloisonné par magasin.
--
-- Robinet anti-spam : magasins.inscriptions_ouvertes (défaut true). L'admin du
-- magasin l'ouvre/ferme via inscriptions_set() (SECURITY DEFINER) ; quand c'est
-- fermé, l'inscription publique est refusée.
-- À exécuter dans l'éditeur SQL Supabase (après multi-magasin + fidélité +
-- clients-telephone).
-- ============================================================================

alter table public.magasins
  add column if not exists inscriptions_ouvertes boolean not null default true;

-- L'admin du magasin ouvre/ferme l'auto-inscription (RLS magasins = superadmin
-- uniquement, on passe donc par une fonction SECURITY DEFINER, comme faveurs_set).
create or replace function public.inscriptions_set(p_ouvert boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin() then raise exception 'réservé à l''admin'; end if;
  update public.magasins
  set inscriptions_ouvertes = coalesce(p_ouvert, true)
  where id = public.mon_magasin();
end; $$;

grant execute on function public.inscriptions_set(boolean) to authenticated;

create or replace function public.inscription_client_publique(
  p_magasin   uuid,
  p_surnom    text,
  p_telephone text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id      uuid;
  v_ouvert  boolean;
  v_surnom  text := btrim(coalesce(p_surnom, ''));
  v_tel     text := btrim(coalesce(p_telephone, ''));
begin
  select inscriptions_ouvertes into v_ouvert
  from public.magasins where id = p_magasin;
  if v_ouvert is null then
    raise exception 'Magasin inconnu.';
  end if;
  if not v_ouvert then
    raise exception 'Les inscriptions sont fermées pour ce magasin.';
  end if;
  if v_surnom = '' then raise exception 'Surnom requis.'; end if;
  if v_tel = '' then raise exception 'Téléphone requis.'; end if;

  -- Anti-doublon / anti-abus : un même numéro dans un même magasin réutilise la
  -- fiche existante (et ne re-crédite pas l'étoile bonus).
  select id into v_id
  from public.clients
  where magasin_id = p_magasin and telephone = v_tel
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.clients (surnom, telephone, magasin_id, tampons)
  values (v_surnom, v_tel, p_magasin, 1) -- +1 étoile offerte à l'inscription
  returning id into v_id;

  return v_id;
end; $$;

grant execute on function public.inscription_client_publique(uuid, text, text) to anon, authenticated;
