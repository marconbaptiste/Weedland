-- ============================================================================
-- Migration — Index de performance pour accélérer les vues et les filtres.
-- ----------------------------------------------------------------------------
-- - chromes(employe_id, date) : v_chromes_jour agrège par (employe_id, date) et
--   v_ca_jour fait la jointure sur ce couple → index composite.
-- - paiements_employes(date) : filtres par plage de dates (Dashboard, Paiements).
-- Sans danger, idempotent. À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

create index if not exists idx_chromes_employe_date on public.chromes (employe_id, date);
create index if not exists idx_paiements_date on public.paiements_employes (date);

-- Met à jour les statistiques du planificateur après création des index.
analyze public.chromes;
analyze public.paiements_employes;
