-- ============================================================================
-- Migration — Carte de fidélité consultable par le client (public, lecture).
-- ----------------------------------------------------------------------------
-- Le client scanne son QR (→ /carte/<id>) et voit l'état de sa carte sans se
-- connecter. fidelite_etat() est SECURITY DEFINER et accessible en anonyme :
-- elle n'expose que le surnom (pseudonyme, RGPD-ok) + le nombre de tampons +
-- le palier, pour un identifiant client (UUID non devinable).
-- À exécuter dans l'éditeur SQL Supabase (après la migration fidélité).
-- ============================================================================

create or replace function public.fidelite_etat(p_client uuid)
returns table (surnom text, tampons int, palier int)
language sql stable security definer set search_path = public as $$
  select c.surnom, c.tampons, m.fidelite_palier
  from public.clients c
  join public.magasins m on m.id = c.magasin_id
  where c.id = p_client;
$$;

grant execute on function public.fidelite_etat(uuid) to anon, authenticated;
