-- ============================================================================
-- Migration — Paiement par VIREMENT (achat réglé par virement bancaire)
-- À exécuter dans l'éditeur SQL Supabase après les migrations existantes.
--
-- Besoin : certains clients règlent un ACHAT par virement. On l'enregistre sur
-- la fiche client (comme une avance/un remboursement), mais un virement est de
-- l'argent RÉELLEMENT ENTRÉ pour une VENTE → il AJOUTE au CA ET aux
-- encaissements du jour (comme les espèces/CB). Contrairement à une avance il ne
-- crée AUCUNE dette, et contrairement à un remboursement ce n'est pas le
-- remboursement d'une dette → il n'affecte PAS le solde du client.
--
-- Modèle : nouveau type de `chromes` = 'virement'.
--   CA du jour    = ventes_directes + avances − remboursements + VIREMENTS
--   Encaissements = CB + espèces + VIREMENTS
--   Solde client  = Σ avances − Σ remboursements  (inchangé : virement exclu)
-- ============================================================================

-- 1) Autoriser le type 'virement' sur les chromes.
alter table public.chromes drop constraint if exists chromes_type_check;
alter table public.chromes
  add constraint chromes_type_check check (type in ('avance', 'remboursement', 'virement'));

-- 2) v_chromes_jour : agréger aussi les virements par (date, employé).
create or replace view public.v_chromes_jour
with (security_invoker = on) as
select
  date,
  employe_id,
  coalesce(sum(montant) filter (where type = 'avance'), 0)        as avances,
  coalesce(sum(montant) filter (where type = 'remboursement'), 0) as remboursements,
  coalesce(sum(montant) filter (where type = 'virement'), 0)      as virements
from public.chromes
group by date, employe_id;

-- 3) v_ca_jour : intégrer les virements au CA, aux encaissements et à
--    l'intéressement. (On recrée d'abord la vue dépendante.)
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
  c.fond_caisse,
  c.heures_travaillees,
  u.pourcentage_interessement,
  1 + (select count(*) from public.caisse_partage p where p.caisse_id = c.id) as nb_partageurs,
  coalesce(ch.avances, 0)        as avances,
  coalesce(ch.remboursements, 0) as remboursements,
  coalesce(ch.virements, 0)      as virements,
  c.ventes_directes + coalesce(ch.avances, 0) - coalesce(ch.remboursements, 0) + coalesce(ch.virements, 0) as ca_jour,
  c.cb + c.especes + coalesce(ch.virements, 0)                                as encaissements,
  c.ventes_directes + coalesce(ch.remboursements, 0) + coalesce(ch.virements, 0) as encaissements_attendus,
  (c.cb + c.especes + coalesce(ch.virements, 0))
    - (c.ventes_directes + coalesce(ch.remboursements, 0) + coalesce(ch.virements, 0)) as ecart,
  round(
    (c.ventes_directes + coalesce(ch.avances, 0) - coalesce(ch.remboursements, 0) + coalesce(ch.virements, 0))
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

-- 4) Droits : réservé aux utilisateurs authentifiés (jamais anon).
grant select on public.v_ca_jour, public.v_interessement_employe to authenticated;
revoke select on public.v_ca_jour, public.v_chromes_jour, public.v_solde_client, public.v_interessement_employe from anon;
