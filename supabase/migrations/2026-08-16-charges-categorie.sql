-- Comptabilité pro : catégorie sur les charges (loyer, salaires, énergie…).
-- Texte libre côté base (la liste vit dans le front : src/lib/categoriesCharges.js),
-- nullable (les lignes existantes tombent dans « Autre » à l'affichage).
-- À exécuter dans l'éditeur SQL Supabase.
alter table public.charges add column if not exists categorie text;
