-- ============================================================================
-- Édition PARTAGÉE des fiches clients (surnom / téléphone / note interne).
-- ----------------------------------------------------------------------------
-- Jusqu'ici seul l'admin pouvait modifier une fiche (policy clients_admin_update).
-- Au comptoir, tout employé doit pouvoir corriger un surnom, un téléphone ou la
-- note interne. On ouvre ça SANS exposer les colonnes sensibles : une fonction
-- SECURITY DEFINER qui ne touche QUE ces 3 colonnes, cloisonnée par magasin.
--
-- Sécurité : la policy UPDATE de la table `clients` reste admin-only. Un employé
-- ne peut donc PAS écrire directement sur `clients` (tampons, recompenses,
-- fid_token, magasin_id…) via la clé anon — l'anti-triche fidélité et le
-- cloisonnement multi-magasin restent intacts. Seules les 3 colonnes « fiche »
-- passent, et uniquement pour un membre du magasin du client.
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

create or replace function public.client_maj(
  p_client    uuid,
  p_surnom    text,
  p_telephone text,
  p_note      text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_membre() then
    raise exception 'non autorisé';
  end if;
  update public.clients
     set surnom      = coalesce(nullif(btrim(p_surnom), ''), surnom), -- surnom jamais vidé
         telephone   = nullif(btrim(p_telephone), ''),
         description = nullif(btrim(p_note), '')
   where id = p_client
     and magasin_id = public.mon_magasin();                          -- cloisonnement
end; $$;

-- Réservé aux comptes connectés membres (jamais anon).
revoke execute on function public.client_maj(uuid, text, text, text) from public, anon;
grant execute on function public.client_maj(uuid, text, text, text) to authenticated;
