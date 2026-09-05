-- Migration — News : 4 volets (fleurs / produits / fournisseurs / légal) et
-- horodatage de réception de chaque volet dans `veille.volets`.
--
-- Pourquoi : la fusion (2026-09-05b) met à jour le bulletin DU JOUR au lieu d'en
-- créer un nouveau, donc ni le front (« x/N volets reçus ») ni le garde anti-abus
-- serveur (3 min par volet) ne peuvent se fier à l'id ou au `created_at` du
-- bulletin. `volets` = { "fleurs": "<horodatage>", "legal": "<horodatage>", … }.
alter table public.veille add column if not exists volets jsonb not null default '{}'::jsonb;

create or replace function public.veille_fusionner(
  p_magasin uuid,
  p_source text,
  p_volet text,
  p_items jsonb,
  p_intro text default null,
  p_synthese_produits text default null,
  p_synthese_fournisseurs text default null,
  p_synthese_reglementation text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_items jsonb;
  v_cats text[] := case p_volet
    when 'fleurs' then array['fleur']
    when 'produits' then array['produit', 'goodies', 'opportunite']
    when 'fournisseurs' then array['fournisseur', 'tendance']
    else array['interdit', 'autorise', 'a_suivre'] end;
  v_titre text := (case when p_magasin is null then 'News CBD — ' else 'News ciblée — ' end) || to_char(now(), 'YYYY-MM-DD');
  v_marque jsonb := jsonb_build_object(p_volet, to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
begin
  if auth.uid() is not null then raise exception 'réservé au backend'; end if;
  if p_volet not in ('fleurs', 'produits', 'fournisseurs', 'legal') then raise exception 'volet inconnu'; end if;
  -- Bulletin du jour (même périmètre, même source) → verrouillé pour la fusion.
  select id, items into v_id, v_items from public.veille
   where magasin_id is not distinct from p_magasin
     and source = p_source
     and created_at >= date_trunc('day', now())
   order by created_at desc limit 1
   for update;
  if v_id is null then
    insert into public.veille (titre, intro, synthese_produits, synthese_fournisseurs, synthese_reglementation, items, source, magasin_id, volets)
    values (v_titre, p_intro, p_synthese_produits, p_synthese_fournisseurs, p_synthese_reglementation, coalesce(p_items, '[]'::jsonb), p_source, p_magasin, v_marque)
    returning id into v_id;
    return v_id;
  end if;
  -- On remplace les items DU VOLET, on garde ceux des autres volets.
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_items
    from jsonb_array_elements(coalesce(v_items, '[]'::jsonb)) e
   where not (e ->> 'categorie' = any (v_cats));
  update public.veille
     set items = v_items || coalesce(p_items, '[]'::jsonb),
         intro = coalesce(p_intro, intro),
         synthese_produits = coalesce(p_synthese_produits, synthese_produits),
         synthese_fournisseurs = coalesce(p_synthese_fournisseurs, synthese_fournisseurs),
         synthese_reglementation = coalesce(p_synthese_reglementation, synthese_reglementation),
         volets = coalesce(volets, '{}'::jsonb) || v_marque
   where id = v_id;
  return v_id;
end; $$;
revoke execute on function public.veille_fusionner(uuid, text, text, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.veille_fusionner(uuid, text, text, jsonb, text, text, text, text) to service_role;
