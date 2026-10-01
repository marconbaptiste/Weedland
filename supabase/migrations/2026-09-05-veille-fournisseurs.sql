-- Migration — News : 3ᵉ synthèse « Fournisseurs & marché ».
-- Le bulletin distingue désormais les nouveautés produits (fleurs nommées avec
-- molécule/taux, autres produits, goodies), les fournisseurs/grossistes
-- européens (sans tarifs) et les tendances de marché, en plus du légal.
alter table public.veille add column if not exists synthese_fournisseurs text;
