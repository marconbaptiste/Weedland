-- Migration — Stocks : case « pointé » pour faire l'inventaire sans rien oublier.
-- Partagée par toute l'équipe du magasin (deux personnes peuvent compter des
-- rayons différents et voir la même liste). Aucune incidence sur les quantités
-- ni sur le journal des mouvements (trigger `stock_journal` = quantité seulement).
-- RLS : `stocks_update` existante (membres du magasin, cloisonnée magasin_id).
alter table public.stocks add column if not exists inventaire_coche boolean not null default false;
