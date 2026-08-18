-- ============================================================================
-- Migration — Carte de fidélité : étoile de bienvenue + nom du magasin exposé.
-- ----------------------------------------------------------------------------
-- 1) L'auto-inscription redonne +1 étoile de bienvenue (cadeau unique : la
--    déduplication par (magasin, téléphone) empêche d'en farmer sur une même
--    carte ; le stamping reste sinon réservé au personnel).
-- 2) fidelite_etat() expose aussi le NOM du magasin → la page publique
--    /carte/:id peut nommer l'onglet/raccourci « Carte de fidélité – <magasin> »
--    au lieu de « Gestion ».
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

-- 1) Étoile de bienvenue à l'inscription.
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
  if v_ouvert is null then raise exception 'Magasin inconnu.'; end if;
  if not v_ouvert then raise exception 'Les inscriptions sont fermées pour ce magasin.'; end if;
  if v_surnom = '' then raise exception 'Surnom requis.'; end if;
  if v_tel = '' then raise exception 'Téléphone requis.'; end if;

  select id into v_id
  from public.clients
  where magasin_id = p_magasin and telephone = v_tel
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- +1 étoile de bienvenue (offerte une seule fois, à la création).
  insert into public.clients (surnom, telephone, magasin_id, tampons)
  values (v_surnom, v_tel, p_magasin, 1)
  returning id into v_id;

  return v_id;
end; $$;

grant execute on function public.inscription_client_publique(uuid, text, text) to anon, authenticated;

-- 2) fidelite_etat() expose aussi le nom du magasin (changement de signature →
--    drop + recreate). N'expose que des champs d'affichage publics.
drop function if exists public.fidelite_etat(uuid);
create function public.fidelite_etat(p_client uuid)
returns table (surnom text, tampons int, palier int, magasin text)
language sql stable security definer set search_path = public as $$
  select c.surnom, c.tampons, m.fidelite_palier, m.nom
  from public.clients c
  join public.magasins m on m.id = c.magasin_id
  where c.id = p_client;
$$;

grant execute on function public.fidelite_etat(uuid) to anon, authenticated;
