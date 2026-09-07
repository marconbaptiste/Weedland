-- News (veille) : deux synthèses de section écrites par l'IA, en plus de l'intro.
-- `synthese_produits`      = synthèse des nouveautés produits & fournisseurs.
-- `synthese_reglementation`= synthèse du légal & réglementaire.
-- Le détail (articles + sources) reste dans `items` ; le front affiche les
-- synthèses et cache les articles dans des tiroirs. Écriture service_role
-- uniquement (RLS de `veille` inchangée).
alter table public.veille
  add column if not exists synthese_produits text,
  add column if not exists synthese_reglementation text;
