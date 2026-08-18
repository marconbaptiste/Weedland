-- ============================================================================
-- Migration — Historique des mouvements de stock (journal INVIOLABLE).
-- ----------------------------------------------------------------------------
-- Trace qui ajoute / retire du stock (entrée, sortie, création, correction,
-- import, suppression). Journal append-only : une fois inscrit, un mouvement
-- ne peut être ni modifié ni supprimé par personne (aucune policy UPDATE/DELETE
-- → la RLS refuse par défaut). Pour corriger une erreur : faire le mouvement
-- inverse (lui aussi tracé). Cloisonné par magasin.
-- À exécuter dans l'éditeur SQL Supabase (après la migration stocks).
-- ============================================================================

create table if not exists public.stock_mouvements (
  id             bigint generated always as identity primary key,
  magasin_id     uuid not null default public.mon_magasin() references public.magasins(id) on delete cascade,
  stock_id       uuid references public.stocks(id) on delete set null,
  produit        text not null,                    -- nom figé (survit au renommage/suppression du produit)
  employe_id     uuid references public.users(id) on delete set null,
  delta          numeric not null,                 -- + entrée / − sortie
  quantite_apres numeric,                          -- stock résultant (info)
  motif          text not null default 'mouvement',-- entree | sortie | creation | correction | import | suppression
  created_at     timestamptz not null default now()
);
create index if not exists idx_stock_mvt on public.stock_mouvements (magasin_id, created_at desc);

alter table public.stock_mouvements enable row level security;

-- Lecture : membres du magasin. Écriture (insert) : membres du magasin.
drop policy if exists stock_mvt_select on public.stock_mouvements;
create policy stock_mvt_select on public.stock_mouvements for select to authenticated
  using (public.est_membre() and magasin_id = public.mon_magasin());

drop policy if exists stock_mvt_insert on public.stock_mouvements;
create policy stock_mvt_insert on public.stock_mouvements for insert to authenticated
  with check (public.est_membre() and magasin_id = public.mon_magasin());

-- PAS de policy UPDATE ni DELETE : le journal est immuable (RLS refuse tout le
-- reste). Seul le backend service_role / l'éditeur SQL pourrait intervenir.

-- L'auteur est forcé côté serveur (jamais usurpable par le client).
create or replace function public.stock_mvt_auteur()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.employe_id := auth.uid();
  return new;
end; $$;

drop trigger if exists trg_stock_mvt_auteur on public.stock_mouvements;
create trigger trg_stock_mvt_auteur
  before insert on public.stock_mouvements
  for each row execute function public.stock_mvt_auteur();
