-- Migration — Opérations transactionnelles (audit robustesse, C4 + H8).
--
--  C4  Import.jsx « Repartir de zéro » supprimait TOUS les chromes puis
--      insérait : si l'insertion échouait (surnom non rattaché, coupure), tout
--      l'historique de dettes était perdu. → `importer_chromes(p_lignes, p_remplacer)`
--      fait purge + création des clients manquants + insertion dans UNE
--      transaction (tout ou rien).
--  H8  Cloture.jsx remplaçait les co-participants par delete puis insert (non
--      atomique : la clôture pouvait rester sans co-participants). →
--      `caisse_partage_set(p_caisse, p_partageurs)`.
--
-- 🔒 Les deux fonctions sont SECURITY DEFINER avec search_path figé, bornées au
-- magasin de l'appelant (mon_magasin()) : importer_chromes exige est_admin() ;
-- caisse_partage_set exige d'être le propriétaire de la clôture ou un admin du
-- magasin, et n'accepte que des collègues du même magasin.

create or replace function public.importer_chromes(p_lignes jsonb, p_remplacer boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_mag uuid := public.mon_magasin();
  v_crees int := 0;
  v_lignes int := 0;
  l jsonb;
  v_surnom text; v_type text; v_montant numeric; v_date date; v_client uuid;
begin
  if not public.est_admin() or v_mag is null then raise exception 'non autorisé'; end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then raise exception 'lignes invalides'; end if;
  if jsonb_array_length(p_lignes) > 20000 then raise exception 'trop de lignes (max 20 000)'; end if;

  if p_remplacer then
    delete from public.chromes where magasin_id = v_mag;
  end if;

  for l in select * from jsonb_array_elements(p_lignes) loop
    v_surnom := left(btrim(coalesce(l ->> 'surnom', '')), 40);
    v_type := l ->> 'type';
    v_montant := (l ->> 'montant')::numeric;
    v_date := (l ->> 'date')::date;
    if v_surnom = '' then raise exception 'surnom manquant (ligne %)', v_lignes + 1; end if;
    if v_type not in ('avance', 'remboursement', 'autre') then raise exception 'type invalide « % » (ligne %)', v_type, v_lignes + 1; end if;
    if v_montant is null or v_montant <= 0 then raise exception 'montant invalide (ligne %)', v_lignes + 1; end if;

    -- Rattachement par surnom (insensible à la casse), création si absent.
    select id into v_client from public.clients
      where magasin_id = v_mag and lower(surnom) = lower(v_surnom)
      order by created_at limit 1;
    if v_client is null then
      insert into public.clients (surnom, magasin_id) values (v_surnom, v_mag) returning id into v_client;
      v_crees := v_crees + 1;
    end if;

    insert into public.chromes (client_id, type, montant, date, employe_id, magasin_id)
    values (v_client, v_type, v_montant, v_date, auth.uid(), v_mag);
    v_lignes := v_lignes + 1;
  end loop;

  return jsonb_build_object('lignes', v_lignes, 'clients_crees', v_crees);
end; $$;
revoke execute on function public.importer_chromes(jsonb, boolean) from public, anon;
grant execute on function public.importer_chromes(jsonb, boolean) to authenticated;

create or replace function public.caisse_partage_set(p_caisse uuid, p_partageurs jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_mag uuid := public.mon_magasin();
  v_owner uuid;
  p jsonb;
  v_emp uuid; v_heures numeric;
begin
  select employe_id into v_owner from public.caisse_jour
    where id = p_caisse and magasin_id = v_mag;
  if v_owner is null then raise exception 'Clôture introuvable'; end if;
  if v_owner <> auth.uid() and not public.est_admin() then raise exception 'non autorisé'; end if;
  if p_partageurs is null or jsonb_typeof(p_partageurs) <> 'array' then raise exception 'partageurs invalides'; end if;

  delete from public.caisse_partage where caisse_id = p_caisse;
  for p in select * from jsonb_array_elements(p_partageurs) loop
    v_emp := (p ->> 'employe_id')::uuid;
    v_heures := greatest(coalesce((p ->> 'heures_travaillees')::numeric, 0), 0);
    if v_emp = v_owner then continue; end if; -- le propriétaire n'est jamais co-participant
    if not exists (select 1 from public.users u where u.id = v_emp and u.magasin_id = v_mag) then
      raise exception 'Collègue hors du magasin';
    end if;
    insert into public.caisse_partage (caisse_id, employe_id, heures_travaillees, magasin_id)
    values (p_caisse, v_emp, v_heures, v_mag)
    on conflict (caisse_id, employe_id) do update set heures_travaillees = excluded.heures_travaillees;
  end loop;
end; $$;
revoke execute on function public.caisse_partage_set(uuid, jsonb) from public, anon;
grant execute on function public.caisse_partage_set(uuid, jsonb) to authenticated;
