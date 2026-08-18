-- ============================================================================
-- Migration — collegues() cloisonné par magasin.
-- ----------------------------------------------------------------------------
-- collegues() (SECURITY DEFINER) listait TOUS les utilisateurs, tous magasins
-- confondus (fuite inter-magasins + sélecteurs non bornés). On la restreint au
-- magasin de l'appelant. Utilisé par la journée partagée (Caisse) et la
-- réaffectation d'un chrome (Clients).
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

drop function if exists public.collegues();
create function public.collegues()
returns table (id uuid, nom text, pourcentage_interessement numeric)
language sql stable security definer set search_path = public as $$
  select id, nom, pourcentage_interessement
  from public.users
  where magasin_id = public.mon_magasin()
  order by nom;
$$;
grant execute on function public.collegues() to authenticated;
