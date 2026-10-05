-- Monétisation : trois nouvelles options d'abonnement par magasin.
--   opt_livraisons : module Commandes & livraisons (8 €/mois)
--   opt_compta     : Compta Pro — trésorerie, TVA, compte de résultat… (12 €/mois)
--   opt_news       : News IA — génération du bulletin personnalisé (9 €/mois)
-- Défaut false : les magasins existants (hors `gratuit`, qui a tout) doivent
-- activer l'option dans Gestion → Abonnement. La grille complète (socle 29 €,
-- packs Boutique/Pro/Premium) vit dans src/lib/tarifs.js, répliquée dans
-- l'Edge Function stripe-options (remise pack automatique par coupon Stripe).
-- (Appliquée en prod le 2026-08-16 via l'éditeur SQL.)

alter table public.magasins
  add column if not exists opt_livraisons boolean not null default false,
  add column if not exists opt_compta boolean not null default false,
  add column if not exists opt_news boolean not null default false;
