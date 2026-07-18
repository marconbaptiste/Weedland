-- ============================================================================
-- Abonnement à options — version basique (49 € HT) + options activables :
--   • Emploi du temps (Plannings)  +5 €
--   • Gestion de stock (Stocks)    +10 €
--   • Programme de fidélité         +20 €
-- ----------------------------------------------------------------------------
-- Chaque magasin porte 3 drapeaux d'option. Le superadmin les active (et plus
-- tard, un webhook Stripe les basculera selon l'abonnement). L'app verrouille
-- les modules correspondants côté front (nav/pages) ; l'écriture reste de toute
-- façon cloisonnée par la RLS existante (les options = un paywall, pas une
-- frontière de sécurité inter-magasins).
--
-- Choix : les magasins DÉJÀ en service gardent tout (backfill à true) ; les
-- NOUVEAUX magasins démarrent en basique (défaut false).
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

alter table public.magasins
  add column if not exists opt_planning boolean not null default false,
  add column if not exists opt_stock    boolean not null default false,
  add column if not exists opt_fidelite boolean not null default false;

-- Les magasins existants conservent les modules déjà utilisés.
update public.magasins
   set opt_planning = true, opt_stock = true, opt_fidelite = true;
