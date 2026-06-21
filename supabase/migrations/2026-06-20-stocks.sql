-- ============================================================================
-- Migration — Gestion des stocks.
-- Registre PARTAGÉ : tout employé connecté consulte et ajuste les quantités
-- (mouvements au comptoir) ; seul l'admin peut supprimer un produit.
-- À exécuter dans l'éditeur SQL Supabase (après les migrations précédentes).
-- ============================================================================

create table if not exists public.stocks (
  id           uuid primary key default gen_random_uuid(),
  categorie    text not null default '',                 -- type de produit
  nom          text not null,                            -- nom du produit
  quantite     numeric(12, 2) not null default 0 check (quantite >= 0),
  unite        text not null default 'g',                -- g, kg, mg, ml, pièce…
  seuil_alerte numeric(12, 2) not null default 0 check (seuil_alerte >= 0),
  prix_achat   numeric(10, 2) not null default 0 check (prix_achat >= 0),
  prix_vente   numeric(10, 2) not null default 0 check (prix_vente >= 0),
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_stocks_categorie on public.stocks (categorie);

alter table public.stocks enable row level security;

-- Lecture + création + mise à jour : tout employé connecté (registre partagé).
drop policy if exists stocks_select on public.stocks;
create policy stocks_select on public.stocks for select to authenticated using (true);

drop policy if exists stocks_insert on public.stocks;
create policy stocks_insert on public.stocks for insert to authenticated with check (true);

drop policy if exists stocks_update on public.stocks;
create policy stocks_update on public.stocks for update to authenticated using (true) with check (true);

-- Suppression réservée à l'admin.
drop policy if exists stocks_delete on public.stocks;
create policy stocks_delete on public.stocks for delete to authenticated using (public.est_admin());
