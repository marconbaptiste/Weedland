-- ============================================================================
-- Migration — Raccourcis de faveurs configurables (par magasin).
-- Liste de libellés (ex. « 1g offert », « Preroll offert ») : un clic dans la
-- fiche client ajoute la faveur. Édition réservée à l'admin du magasin.
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

alter table public.magasins
  add column if not exists faveurs_raccourcis text[] not null
  default array['1g offert', 'Preroll offert']::text[];

create or replace function public.faveurs_set(p_libelles text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin() then raise exception 'réservé à l''admin'; end if;
  update public.magasins
  set faveurs_raccourcis = coalesce(p_libelles, '{}')
  where id = public.mon_magasin();
end; $$;

grant execute on function public.faveurs_set(text[]) to authenticated;
