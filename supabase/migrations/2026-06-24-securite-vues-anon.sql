-- ============================================================================
-- Migration — Durcissement sécurité : couper l'accès du rôle PUBLIC (anon)
-- aux vues internes.
-- ----------------------------------------------------------------------------
-- Contexte : les vues d'agrégat (CA, soldes, chromes, intéressement) avaient un
-- GRANT SELECT ... TO anon (hérité des recréations de vues). En pratique elles
-- renvoyaient déjà 0 ligne à un anonyme (security_invoker = on → la RLS des
-- tables sous-jacentes s'applique), mais il n'y a AUCUNE raison de les exposer
-- au public : on retire le droit pour réduire la surface d'attaque (défense en
-- profondeur — ceinture + bretelles).
--
-- Ce qui reste légitimement accessible en anonyme (parcours carte de fidélité) :
--   - fonction fidelite_etat(uuid)            → surnom + tampons + palier
--   - fonction inscription_client_publique()  → création de la carte
-- Ces EXECUTE ne sont PAS touchés ici.
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

revoke select on
  public.v_ca_jour,
  public.v_chromes_jour,
  public.v_solde_client,
  public.v_interessement_employe
from anon;
