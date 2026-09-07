-- ============================================================================
-- Magasin « gratuit » — accès à TOUTES les options, sans facturation.
-- Prévu pour le magasin originel (Weedland) : il reste débloqué à vie, quoi
-- qu'il arrive aux drapeaux d'options ou à la facturation Stripe.
-- L'app accorde toutes les options si `gratuit = true` (cf. AuthProvider).
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

alter table public.magasins add column if not exists gratuit boolean not null default false;

-- Filet de sécurité : les magasins existants gardent toutes les options
-- (au cas où le backfill précédent n'aurait pas été appliqué).
update public.magasins set opt_planning = true, opt_stock = true, opt_fidelite = true;

-- Le magasin originel reste gratuit à vie.
update public.magasins set gratuit = true where nom = 'Weedland';
