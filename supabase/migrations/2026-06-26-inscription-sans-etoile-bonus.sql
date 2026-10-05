-- ============================================================================
-- Migration — Inscription publique : plus d'étoile bonus automatique.
-- ----------------------------------------------------------------------------
-- Règle de sécurité : SEUL le personnel (employé/admin) peut créditer des
-- tampons. L'auto-inscription d'un client ne doit donc plus offrir d'étoile :
-- une nouvelle carte démarre à 0 tampon. Le stamping reste exclusivement via
-- fidelite_ajouter (est_membre() + authenticated).
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

create or replace function public.inscription_client_publique(
  p_magasin   uuid,
  p_surnom    text,
  p_telephone text
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id      uuid;
  v_ouvert  boolean;
  v_surnom  text := btrim(coalesce(p_surnom, ''));
  v_tel     text := btrim(coalesce(p_telephone, ''));
begin
  select inscriptions_ouvertes into v_ouvert
  from public.magasins where id = p_magasin;
  if v_ouvert is null then
    raise exception 'Magasin inconnu.';
  end if;
  if not v_ouvert then
    raise exception 'Les inscriptions sont fermées pour ce magasin.';
  end if;
  if v_surnom = '' then raise exception 'Surnom requis.'; end if;
  if v_tel = '' then raise exception 'Téléphone requis.'; end if;

  -- Anti-doublon : un même numéro dans un même magasin réutilise la fiche.
  select id into v_id
  from public.clients
  where magasin_id = p_magasin and telephone = v_tel
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- Carte créée à 0 tampon : seul le personnel peut en ajouter ensuite.
  insert into public.clients (surnom, telephone, magasin_id)
  values (v_surnom, v_tel, p_magasin)
  returning id into v_id;

  return v_id;
end; $$;

grant execute on function public.inscription_client_publique(uuid, text, text) to anon, authenticated;
