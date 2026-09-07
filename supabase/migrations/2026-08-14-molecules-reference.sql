-- Reference GLOBALE des molecules cannabinoides (statut legal identique pour tous
-- les magasins => pas de magasin_id, comme les bulletins veille globaux). Alimentee
-- par l'Edge Function veille-cbd (recherche web IA : nouvelle molecule ou changement
-- de statut). Lecture : tous les membres. Ecriture : service_role uniquement
-- (aucune policy INSERT/UPDATE pour les comptes) -> pas de fuite ni d'alteration
-- inter-magasin possible cote client. Affichee dans la page News, sous le bandeau
-- « informations indicatives ».
create table if not exists public.molecules (
  code text primary key,
  nom text not null,
  statut text not null check (statut in ('autorise','gris','interdit')),
  profil text,
  avis text,
  a_noter text,
  ordre int not null default 100,
  updated_at timestamptz not null default now()
);

alter table public.molecules enable row level security;

drop policy if exists molecules_lecture on public.molecules;
create policy molecules_lecture on public.molecules
  for select to authenticated using (est_membre());

insert into public.molecules (code, nom, statut, profil, avis, a_noter, ordre) values
  ('CBD','Cannabidiol','autorise','Détente sans « high ». Anxiété, sommeil, douleurs, récupération.','La molécule reine — 80 %+ des ventes. Clientèle large.','Fleurs autorisées depuis 2022 (Conseil d''État). Base de presque tous les produits.',10),
  ('CBG','Cannabigérol','autorise','Clarté / concentration, anti-inflammatoire, confort digestif. Non planant.','En nette hausse. Plébiscité par la clientèle avertie « journée / focus ».','« Molécule mère » des cannabinoïdes. Bon argument de montée en gamme.',11),
  ('CBN','Cannabinol','autorise','Relaxation, sédation douce. Star du créneau sommeil.','Très demandé en combo « nuit » (CBD + CBN). Fort bouche-à-oreille.','Issu de la dégradation du THC, mais non psychotrope aux doses vendues.',12),
  ('CBC','Cannabichromène','autorise','Humeur, anti-inflammatoire. Renforce l''« effet d''entourage ».','Émergent. Encore niche, mais monte dans les huiles « spectre complet ».','Rarement vendu seul : surtout en synergie avec CBD/CBG.',13),
  ('CBDV','Cannabidivarine','autorise','Proche du CBD, non planant. Étudié côté neuro / digestif.','Confidentiel. Demande grand public quasi nulle pour l''instant.','Argument « premium / rare » plus que volume de vente.',14),
  ('CBDP','Cannabidiphorol','autorise','Analogue « longue chaîne » du CBD, non psychotrope. Peu documenté.','Très niche, surtout mis en avant comme nouveauté marketing.','Peu de recul scientifique — rester factuel dans les promesses.',15),
  ('H4CBD','Hexahydrocannabidiol','gris','CBD hydrogéné, détente marquée, léger effet psychoactif rapporté.','Monté en vitrine après l''interdiction du HHC. Avis partagés (dosage variable).','Non explicitement classé, mais sous surveillance. Beaucoup de boutiques restent prudentes.',20),
  ('H2CBD','Dihydrocannabidiol','gris','Semi-synthétique proche du CBD, effet doux, peu de recul.','Très marginal. Curiosité plus que demande réelle.','Même logique de flou réglementaire que le H4CBD.',21),
  ('THCV','Tétrahydrocannabivarine','gris','Énergie, coupe-faim. Peu/pas planant à faible dose, stimulant à forte dose.','Niche « minceur / énergie ». Intérêt réel mais offre rare et chère.','Légalité dépend de l''origine et du taux de THC — à sécuriser au cas par cas.',22),
  ('THCP','Tétrahydrocannabiphorol','gris','Naturel mais ultra-puissant (forte affinité, très planant).','Attire par la puissance, mais réputation « trop fort / risqué ».','En pratique traité comme le THC → à considérer comme interdit en boutique.',23),
  ('10-OH-HHC','10-hydroxy-hexahydrocannabinol','gris','Dérivé/métabolite du HHC, effet psychoactif modéré annoncé.','Proposé comme contournement post-HHC. Accueil méfiant.','Proximité directe avec le HHC interdit → risque élevé de classement.',24),
  ('HHC','Hexahydrocannabinol','interdit','Semi-synthétique, effet « planant » proche d''un THC léger.','Carton de 2022-2023… puis chute nette après interdiction.','Classé stupéfiant en France depuis le 13 juin 2023, interdit dans plusieurs pays UE.',30),
  ('HHCPO','HHC-P / HHC-O — analogues','interdit','Versions estérifiées / renforcées du HHC, plus puissantes.','Vagues successives d''« alternatives », vite rattrapées par la loi.','Suivent le HHC dans les interdictions — même famille, même issue.',31),
  ('D8/D10','Delta-8 & Delta-10 THC','interdit','Isomères du THC, planant plus doux que le delta-9.','Gros marché aux USA ; en France, demande bridée par l''interdiction.','Assimilés au THC → stupéfiants. Pas pour la vitrine.',32),
  ('THC','Delta-9 tétrahydrocannabinol','interdit','Le cannabinoïde psychotrope de référence.','La « came » que le CBD cherche à remplacer légalement.','Produit fini toléré uniquement ≤ 0,3 %. Au-delà : stupéfiant.',33)
on conflict (code) do nothing;
