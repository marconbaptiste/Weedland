-- ============================================================================
-- Migration — Numéro de téléphone (optionnel) sur la fiche client.
-- À la demande du commerçant : récupérer un numéro « au cas où » (rappel d'une
-- dette, info promo…). Champ FACULTATIF, renseigné avec l'accord du client.
-- RGPD : reste cloisonné par magasin via la RLS existante sur `clients` ;
-- toujours pas de nom/prénom réel, le surnom demeure l'identifiant.
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

alter table public.clients
  add column if not exists telephone text;

-- On expose le téléphone dans la vue du solde (utilisée par la fiche client).
-- Ajout en fin de SELECT pour rester compatible avec `create or replace view`.
create or replace view public.v_solde_client
with (security_invoker = on) as
select
  cl.id  as client_id,
  cl.surnom,
  cl.description,
  coalesce(sum(ch.montant) filter (where ch.type = 'avance'), 0)
    - coalesce(sum(ch.montant) filter (where ch.type = 'remboursement'), 0) as solde,
  cl.telephone
from public.clients cl
left join public.chromes ch on ch.client_id = cl.id
group by cl.id, cl.surnom, cl.description, cl.telephone;

grant select on public.v_solde_client to anon, authenticated;
