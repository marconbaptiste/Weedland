-- ============================================================================
-- Migration — « Virements / autres » : un 3ᵉ canal d'encaissement à côté de
-- CB et espèces (virement bancaire, etc.).
-- ----------------------------------------------------------------------------
-- Contexte : le CA de la caisse peut être encaissé autrement qu'en CB ou en
-- espèces (virements notamment). Jusqu'ici l'app ne connaissait que CB + espèces
-- (ventes_directes = CB + espèces), si bien que ces montants « manquaient » dans
-- les encaissements et faisaient apparaître un écart de caisse.
--
-- Après cette migration :
--   ventes_directes = CB + espèces + virements   (convention, cf. comptabilite.js)
--   encaissements   = CB + espèces + virements (+ autres chromes)
-- Le CA (ca_jour) est inchangé pour toutes les lignes existantes : la colonne
-- virements a pour défaut 0, donc encaissements et ecart restent identiques
-- partout tant qu'aucun virement n'est saisi. Seule la correction de l'historique
-- ci-dessous (magasin Weedland, import « Reprise ») renseigne des virements.
--
-- À exécuter dans l'éditeur SQL Supabase (après les migrations précédentes).
-- ============================================================================

-- 1) Colonne virements sur les clôtures (neutre par défaut : 0).
alter table public.caisse_jour
  add column if not exists virements numeric(10, 2) not null default 0
    check (virements >= 0);

-- 2) Vues recalculées : encaissements incluent désormais les virements.
--    (v_interessement_employe dépend de v_ca_jour → on la recrée aussi.)
drop view if exists public.v_interessement_employe;
drop view if exists public.v_ca_jour;

create view public.v_ca_jour
with (security_invoker = on) as
select
  c.id          as caisse_id,
  c.date,
  c.employe_id,
  c.ventes_directes,
  c.cb,
  c.especes,
  c.virements,
  c.fond_caisse,
  c.heures_travaillees,
  u.pourcentage_interessement,   -- taux du compte (Comptes), en direct
  1 + (select count(*) from public.caisse_partage p where p.caisse_id = c.id) as nb_partageurs,
  coalesce(ch.avances, 0)        as avances,
  coalesce(ch.remboursements, 0) as remboursements,
  coalesce(ch.autres, 0)         as autres,
  c.ventes_directes + coalesce(ch.avances, 0) - coalesce(ch.remboursements, 0) + coalesce(ch.autres, 0) as ca_jour,
  c.cb + c.especes + c.virements + coalesce(ch.autres, 0)                                               as encaissements,
  c.ventes_directes + coalesce(ch.remboursements, 0) + coalesce(ch.autres, 0)                           as encaissements_attendus,
  (c.cb + c.especes + c.virements + coalesce(ch.autres, 0))
    - (c.ventes_directes + coalesce(ch.remboursements, 0) + coalesce(ch.autres, 0))                     as ecart,
  round(
    (c.ventes_directes + coalesce(ch.avances, 0) - coalesce(ch.remboursements, 0) + coalesce(ch.autres, 0))
      / (1 + (select count(*) from public.caisse_partage p where p.caisse_id = c.id))
      * u.pourcentage_interessement / 100,
    2
  ) as interessement
from public.caisse_jour c
join public.users u on u.id = c.employe_id
left join public.v_chromes_jour ch
  on ch.date = c.date and ch.employe_id = c.employe_id;

create view public.v_interessement_employe
with (security_invoker = on) as
select
  c.employe_id, c.caisse_id, c.date, true as est_proprietaire,
  c.heures_travaillees, c.pourcentage_interessement,
  c.ca_jour, c.encaissements, c.ecart, c.interessement
from public.v_ca_jour c
union all
select
  p.employe_id, c.caisse_id, c.date, false as est_proprietaire,
  p.heures_travaillees, u.pourcentage_interessement,
  null::numeric, null::numeric, null::numeric,
  round(c.ca_jour / c.nb_partageurs * u.pourcentage_interessement / 100, 2)
from public.caisse_partage p
join public.v_ca_jour c on c.caisse_id = p.caisse_id
join public.users u on u.id = p.employe_id;

grant select on
  public.v_ca_jour,
  public.v_interessement_employe
to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3) Correction ONE-SHOT de l'historique (magasin Weedland, import « Reprise »).
--    Le décalage CA − CB − espèces est, par définition, le montant des
--    virements / autres encaissements de la journée (confirmé par le commerçant).
--    On ne renseigne que les jours à décalage POSITIF ; les jours à décalage
--    négatif (sur-encaissement CB/espèces vs CA) sont de vraies anomalies de
--    saisie et sont laissés tels quels (virements = 0) pour revue manuelle.
-- ----------------------------------------------------------------------------
update public.caisse_jour c
set virements = c.ventes_directes - c.cb - c.especes
from public.users u
join public.magasins m on m.id = u.magasin_id
where u.id = c.employe_id
  and u.nom = 'Reprise'
  and m.nom = 'Weedland'
  and c.virements = 0
  and (c.ventes_directes - c.cb - c.especes) > 0;
