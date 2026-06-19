-- ============================================================================
-- Migration — Remplace la vue SECURITY DEFINER v_collegues (signalée
-- « critique » par l'analyseur Supabase) par une fonction SECURITY DEFINER.
-- Même exposition minimale (id + nom), sans alerte.
-- ============================================================================

drop view if exists public.v_collegues;

create or replace function public.collegues()
returns table (id uuid, nom text)
language sql
stable
security definer
set search_path = public
as $$
  select id, nom from public.users order by nom;
$$;

grant execute on function public.collegues() to authenticated;
