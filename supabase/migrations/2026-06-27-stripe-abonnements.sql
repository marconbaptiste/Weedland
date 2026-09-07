-- ============================================================================
-- Migration — Abonnements Stripe (facturation des magasins).
-- ----------------------------------------------------------------------------
-- On relie chaque magasin à son client Stripe et on garde une copie locale du
-- statut d'abonnement (mise à jour par le webhook Stripe). Le blocage existant
-- (AuthProvider.magasinBloque) continue de s'appuyer sur abonnement / essai_fin,
-- désormais pilotés par Stripe :
--   trialing            → abonnement 'essai',    essai_fin = fin d'essai
--   active              → abonnement 'actif'
--   past_due/unpaid/... → abonnement 'suspendu'
--   canceled            → abonnement 'suspendu'
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

alter table public.magasins
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_statut          text,        -- statut brut Stripe
  add column if not exists echeance               date;        -- current_period_end

create index if not exists idx_magasins_stripe_customer on public.magasins (stripe_customer_id);

-- L'admin du magasin peut renseigner l'ID client Stripe (sinon créé au checkout).
-- L'écriture des autres colonnes Stripe se fait par le webhook (service_role).
-- La page Pilotage (superadmin) gère déjà magasins via la policy magasins_superadmin.
