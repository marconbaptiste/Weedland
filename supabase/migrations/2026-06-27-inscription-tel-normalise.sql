-- ============================================================================
-- Migration — Anti-triche inscription publique.
-- ----------------------------------------------------------------------------
-- 1) normaliser_tel() : ramène un téléphone FR à une forme canonique (chiffres
--    seuls, +33/0033 → 0…) pour une déduplication insensible au format.
-- 2) inscription_client_publique : dédup sur le numéro NORMALISÉ + plus d'étoile
--    de bienvenue (carte créée à 0 tampon ; seul le personnel crédite ensuite).
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

create or replace function public.normaliser_tel(p text)
returns text language sql immutable as $$
  with d as (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as n)
  select case
    when n like '0033%' then '0' || substr(n, 5)
    when length(n) = 11 and n like '33%' then '0' || substr(n, 3)
    else n
  end from d;
$$;

create or replace function public.inscription_client_publique(
  p_magasin uuid, p_surnom text, p_telephone text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_ouvert boolean;
  v_surnom text := btrim(coalesce(p_surnom, ''));
  v_tel text := btrim(coalesce(p_telephone, ''));
begin
  select inscriptions_ouvertes into v_ouvert from public.magasins where id = p_magasin;
  if v_ouvert is null then raise exception 'Magasin inconnu.'; end if;
  if not v_ouvert then raise exception 'Les inscriptions sont fermées pour ce magasin.'; end if;
  if v_surnom = '' then raise exception 'Surnom requis.'; end if;
  if v_tel = '' then raise exception 'Téléphone requis.'; end if;

  -- Anti-doublon sur numéro normalisé (insensible au format).
  select id into v_id from public.clients
  where magasin_id = p_magasin
    and public.normaliser_tel(telephone) = public.normaliser_tel(v_tel)
  limit 1;
  if v_id is not null then return v_id; end if;

  -- Carte à 0 tampon : pas d'étoile de bienvenue auto (le personnel crédite).
  insert into public.clients (surnom, telephone, magasin_id)
  values (v_surnom, v_tel, p_magasin)
  returning id into v_id;
  return v_id;
end; $$;

grant execute on function public.inscription_client_publique(uuid, text, text) to anon, authenticated;
