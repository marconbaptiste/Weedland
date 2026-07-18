-- ============================================================================
-- Migration — Trace des corrections de chromes.
-- ----------------------------------------------------------------------------
-- Pour garder une trace quand un chrome est corrigé (montant, date, employé
-- réaffecté…), on enregistre QUI l'a modifié et QUAND, via un trigger qui
-- remplit modifie_le / modifie_par à chaque UPDATE. Affiché dans l'Historique.
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

alter table public.chromes
  add column if not exists modifie_le  timestamptz,
  add column if not exists modifie_par uuid references public.users(id);

create or replace function public.chromes_trace_modif()
returns trigger language plpgsql set search_path = public as $$
begin
  new.modifie_le := now();
  new.modifie_par := auth.uid();
  return new;
end; $$;

drop trigger if exists trg_chromes_modif on public.chromes;
create trigger trg_chromes_modif
  before update on public.chromes
  for each row execute function public.chromes_trace_modif();
