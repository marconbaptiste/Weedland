-- Migration — Vues d'intéressement alignées sur l'app (audit robustesse, C2).
--
-- Bug : la dernière définition de `v_ca_jour` (2026-08-08) divisait
-- l'intéressement par `nb_partageurs` (1 + nombre de co-participants), alors que
-- l'app (Cloture.jsx, CLAUDE.md) divise par `nb_interesses` = personnes présentes
-- au TAUX > 0 (un collègue à 0 % ne prend pas de part et ne dilue pas les
-- autres). Deux migrations datées 2026-06-19 se contredisaient et les
-- recopies suivantes ont perdu `nb_interesses` → Clôture affichait 50 € et
-- Historique/Comptabilité 25 € pour la même journée. Argent dû aux employés.
--
-- Robustesse RLS : `v_ca_jour` est `security_invoker` et joignait `users`
-- (un employé ne voit que SA ligne) → un co-participant ne voyait pas du tout
-- la clôture partagée, et le compte des « intéressés » était faux pour un
-- employé. Le taux et le nombre d'intéressés sont désormais lus via deux
-- fonctions SECURITY DEFINER bornées au magasin de l'appelant :
--   taux_interessement(p_user)     → taux d'un membre de MON magasin (sinon 0)
--   caisse_nb_interesses(p_caisse) → nb de présents au taux > 0 (owner + partage)
-- (Le taux des collègues est déjà exposé aux membres par `collegues()`.)
--
-- ⚠️ CE FICHIER EST LA DÉFINITION DE RÉFÉRENCE DES DEUX VUES. Toute migration
-- future qui doit les recréer DOIT repartir de ce texte (pas d'une version
-- antérieure).

create or replace function public.taux_interessement(p_user uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select u.pourcentage_interessement from public.users u
      where u.id = p_user and u.magasin_id = public.mon_magasin()),
    0);
$$;
revoke execute on function public.taux_interessement(uuid) from public, anon;
grant execute on function public.taux_interessement(uuid) to authenticated;

create or replace function public.caisse_nb_interesses(p_caisse uuid)
returns int language sql stable security definer set search_path = public as $$
  select
    (case when coalesce(u.pourcentage_interessement, 0) > 0 then 1 else 0 end)
    + (select count(*)::int
         from public.caisse_partage p
         join public.users up on up.id = p.employe_id
        where p.caisse_id = c.id and up.pourcentage_interessement > 0)
  from public.caisse_jour c
  join public.users u on u.id = c.employe_id
  where c.id = p_caisse and c.magasin_id = public.mon_magasin();
$$;
revoke execute on function public.caisse_nb_interesses(uuid) from public, anon;
grant execute on function public.caisse_nb_interesses(uuid) to authenticated;

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
  public.taux_interessement(c.employe_id) as pourcentage_interessement,   -- taux du compte, en direct
  1 + (select count(*) from public.caisse_partage p where p.caisse_id = c.id) as nb_partageurs,
  public.caisse_nb_interesses(c.id) as nb_interesses,
  coalesce(ch.avances, 0)        as avances,
  coalesce(ch.remboursements, 0) as remboursements,
  coalesce(ch.autres, 0)         as autres,
  c.ventes_directes + coalesce(ch.avances, 0) - coalesce(ch.remboursements, 0) + coalesce(ch.autres, 0) as ca_jour,
  c.cb + c.especes + c.virements + coalesce(ch.autres, 0)                                               as encaissements,
  c.ventes_directes + coalesce(ch.remboursements, 0) + coalesce(ch.autres, 0)                           as encaissements_attendus,
  (c.cb + c.especes + c.virements + coalesce(ch.autres, 0))
    - (c.ventes_directes + coalesce(ch.remboursements, 0) + coalesce(ch.autres, 0))                     as ecart,
  -- Intéressement = (CA ÷ nb d'intéressés) × taux / 100 — miroir de comptabilite.js
  coalesce(round(
    (c.ventes_directes + coalesce(ch.avances, 0) - coalesce(ch.remboursements, 0) + coalesce(ch.autres, 0))
      / nullif(public.caisse_nb_interesses(c.id), 0)
      * public.taux_interessement(c.employe_id) / 100,
    2), 0) as interessement
from public.caisse_jour c
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
  p.heures_travaillees, public.taux_interessement(p.employe_id),
  null::numeric, null::numeric, null::numeric,
  coalesce(round(c.ca_jour / nullif(c.nb_interesses, 0) * public.taux_interessement(p.employe_id) / 100, 2), 0)
from public.caisse_partage p
join public.v_ca_jour c on c.caisse_id = p.caisse_id;

grant select on public.v_ca_jour, public.v_interessement_employe to authenticated;
revoke select on public.v_ca_jour, public.v_interessement_employe from anon;
