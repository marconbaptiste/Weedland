-- Infos publiques du magasin pour la carte de fidélité (adresse + horaires).
-- La carte est publique (anon) et ne connaît que l'id du client ; cette fonction
-- SECURITY DEFINER renvoie UNIQUEMENT le nom, l'adresse et les horaires du
-- magasin du client (aucune donnée perso ni financière), cloisonnée par le
-- client passé en paramètre (pas d'énumération inter-magasins).

create or replace function public.magasin_infos_carte(p_client uuid)
returns table(nom text, adresse text, horaires jsonb)
language sql
stable
security definer
set search_path to 'public'
as $$
  select m.nom, m.adresse, m.horaires
  from public.clients c
  join public.magasins m on m.id = c.magasin_id
  where c.id = p_client;
$$;

revoke all on function public.magasin_infos_carte(uuid) from public;
grant execute on function public.magasin_infos_carte(uuid) to anon, authenticated;
