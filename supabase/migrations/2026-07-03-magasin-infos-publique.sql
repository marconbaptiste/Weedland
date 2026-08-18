-- ============================================================================
-- Infos publiques d'un magasin (nom + logo) pour la page d'inscription à la
-- carte de fidélité (white-label : on affiche le magasin, jamais « Kanabiz »).
-- N'expose QUE le nom et le logo (branding destiné à être public) — aucune
-- donnée interne. Ouverte en anon (la page /rejoindre est publique).
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

create or replace function public.magasin_infos_publique(p_magasin uuid)
returns table (nom text, logo text)
language sql
security definer
set search_path = public
as $$
  select nom, logo from public.magasins where id = p_magasin;
$$;

revoke execute on function public.magasin_infos_publique(uuid) from public;
grant execute on function public.magasin_infos_publique(uuid) to anon, authenticated;
