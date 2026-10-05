-- ============================================================================
-- Migration — Inscription publique : déduplication BÉTON (anti multi-cartes).
-- ----------------------------------------------------------------------------
-- Avant : la dédup était un `select … limit 1` puis `insert` → deux requêtes
-- simultanées (même numéro) créaient deux fiches (race), et aucune contrainte
-- en base ne garantissait l'unicité. Un client « technique » pouvait donc se
-- créer plusieurs cartes (cf. les doublons « Jose M »).
-- Après :
--  1) `normaliser_tel` durcie (search_path figé).
--  2) Consolidation des doublons existants (on garde la carte la plus avancée,
--     on lui rattache chromes/promos des doublons, puis on supprime ceux-ci).
--  3) Index UNIQUE réel sur (magasin_id, numéro normalisé).
--  4) `inscription_client_publique` réécrite en `insert … on conflict do
--     nothing` → atomique, ferme la race ET le doublon.
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

-- 1) Normalisation durcie (search_path figé, comme les autres fonctions).
create or replace function public.normaliser_tel(p text)
returns text language sql immutable set search_path = pg_catalog, public as $$
  with d as (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as n)
  select case
    when n like '0033%' then '0' || substr(n, 5)
    when length(n) = 11 and n like '33%' then '0' || substr(n, 3)
    else n
  end from d;
$$;

-- 2) Consolidation des doublons EXISTANTS (sinon l'index unique échouerait).
--    Keeper = la fiche la plus « avancée » (tampons puis récompenses), à défaut
--    la première par id. On rapatrie chromes + promos vers le keeper (chromes a
--    une FK on delete restrict : on ne peut pas supprimer une fiche qui en a),
--    on consolide tampons/récompenses, puis on supprime les doublons.
do $$
declare r record; v_dups uuid[];
begin
  for r in
    select magasin_id,
           public.normaliser_tel(telephone) as tel,
           array_agg(id order by tampons desc, recompenses desc, id) as ids,
           max(tampons)     as t,
           max(recompenses) as rec
    from public.clients
    where telephone is not null and telephone <> ''
    group by magasin_id, public.normaliser_tel(telephone)
    having count(*) > 1
  loop
    v_dups := r.ids[2:array_length(r.ids, 1)]; -- tous sauf le keeper
    update public.chromes set client_id = r.ids[1] where client_id = any(v_dups);
    update public.promos  set client_id = r.ids[1] where client_id = any(v_dups);
    update public.clients set tampons = r.t, recompenses = r.rec where id = r.ids[1];
    delete from public.clients where id = any(v_dups);
  end loop;
end $$;

-- 3) Index UNIQUE réel : un numéro normalisé = une seule carte par magasin.
create unique index if not exists clients_tel_unique
  on public.clients (magasin_id, public.normaliser_tel(telephone))
  where telephone is not null and telephone <> '';

-- 4) Inscription atomique : l'INSERT lui-même fait respecter l'unicité.
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
  -- Garde-fou anti-spam minimal : au moins 6 chiffres (rejette '0', '1'…).
  if length(public.normaliser_tel(v_tel)) < 6 then
    raise exception 'Numéro de téléphone invalide.';
  end if;

  -- Insertion atomique : la contrainte unique ferme la race et le doublon.
  insert into public.clients (surnom, telephone, magasin_id)
  values (v_surnom, v_tel, p_magasin)
  on conflict (magasin_id, public.normaliser_tel(telephone))
    where (telephone is not null and telephone <> '')
  do nothing
  returning id into v_id;

  -- Conflit (numéro déjà inscrit) : on renvoie la carte existante.
  if v_id is null then
    select id into v_id from public.clients
    where magasin_id = p_magasin
      and public.normaliser_tel(telephone) = public.normaliser_tel(v_tel)
    limit 1;
  end if;
  return v_id;
end; $$;

grant execute on function public.inscription_client_publique(uuid, text, text) to anon, authenticated;
