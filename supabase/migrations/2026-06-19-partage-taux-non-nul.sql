-- ============================================================================
-- Migration — Le partage de l'intéressement ne compte QUE les personnes dont
-- le taux est > 0. Un collègue présent mais à 0 % ne « consomme » plus de part
-- et ne dilue donc plus l'intéressement des autres.
-- ----------------------------------------------------------------------------
-- Diviseur = nombre de personnes présentes (propriétaire + co-participants)
-- ayant un pourcentage_interessement > 0. Exemple : Adam 1 % + Kevin 0 %
-- => diviseur 1 => Adam touche CA × 1 % (entier), Kevin 0.
-- À exécuter dans l'éditeur SQL Supabase (après les migrations précédentes).
-- ============================================================================

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
  -- Total des personnes présentes (info / affichage).
  1 + (select count(*) from public.caisse_partage p where p.caisse_id = c.id) as nb_partageurs,
  -- Diviseur réel : seules les personnes au taux > 0 prennent une part.
  (case when u.pourcentage_interessement > 0 then 1 else 0 end)
    + (select count(*) from public.caisse_partage p
         join public.users up on up.id = p.employe_id
         where p.caisse_id = c.id and up.pourcentage_interessement > 0) as nb_interesses,
  coalesce(ch.avances, 0)        as avances,
  coalesce(ch.remboursements, 0) as remboursements,
  c.ventes_directes + coalesce(ch.avances, 0) - coalesce(ch.remboursements, 0) as ca_jour,
  c.cb + c.especes                                                             as encaissements,
  c.ventes_directes + coalesce(ch.remboursements, 0)                           as encaissements_attendus,
  (c.cb + c.especes) - (c.ventes_directes + coalesce(ch.remboursements, 0))    as ecart,
  round(
    (c.ventes_directes + coalesce(ch.avances, 0) - coalesce(ch.remboursements, 0))
      / nullif(
          (case when u.pourcentage_interessement > 0 then 1 else 0 end)
          + (select count(*) from public.caisse_partage p
               join public.users up on up.id = p.employe_id
               where p.caisse_id = c.id and up.pourcentage_interessement > 0), 0)
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
  round(c.ca_jour / nullif(c.nb_interesses, 0) * u.pourcentage_interessement / 100, 2)
from public.caisse_partage p
join public.v_ca_jour c on c.caisse_id = p.caisse_id
join public.users u on u.id = p.employe_id;

grant select on
  public.v_chromes_jour,
  public.v_ca_jour,
  public.v_solde_client,
  public.v_interessement_employe
to anon, authenticated;
