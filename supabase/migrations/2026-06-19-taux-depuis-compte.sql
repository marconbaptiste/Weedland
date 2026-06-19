-- ============================================================================
-- Migration — Le taux d'intéressement vient TOUJOURS du compte (Comptes), en
-- direct, pour tout le monde (propriétaire de clôture ET co-participants).
-- ----------------------------------------------------------------------------
-- Avant : le propriétaire utilisait le % figé sur sa clôture (snapshot), tandis
-- que les co-participants utilisaient le % live du compte → incohérent (changer
-- le taux dans Comptes ne mettait pas à jour les clôtures déjà saisies).
-- Après : v_ca_jour lit users.pourcentage_interessement (live). Modifier un taux
-- dans Comptes recalcule immédiatement tout, partout.
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
  u.pourcentage_interessement,   -- taux du compte (Comptes), en direct
  1 + (select count(*) from public.caisse_partage p where p.caisse_id = c.id) as nb_partageurs,
  coalesce(ch.avances, 0)        as avances,
  coalesce(ch.remboursements, 0) as remboursements,
  c.ventes_directes + coalesce(ch.avances, 0) - coalesce(ch.remboursements, 0) as ca_jour,
  c.cb + c.especes                                                             as encaissements,
  c.ventes_directes + coalesce(ch.remboursements, 0)                           as encaissements_attendus,
  (c.cb + c.especes) - (c.ventes_directes + coalesce(ch.remboursements, 0))    as ecart,
  round(
    (c.ventes_directes + coalesce(ch.avances, 0) - coalesce(ch.remboursements, 0))
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

-- collegues() renvoie aussi le taux, pour l'afficher dans la « journée partagée ».
drop function if exists public.collegues();
create function public.collegues()
returns table (id uuid, nom text, pourcentage_interessement numeric)
language sql stable security definer set search_path = public as $$
  select id, nom, pourcentage_interessement from public.users order by nom;
$$;
grant execute on function public.collegues() to authenticated;

grant select on
  public.v_chromes_jour,
  public.v_ca_jour,
  public.v_solde_client,
  public.v_interessement_employe
to anon, authenticated;
