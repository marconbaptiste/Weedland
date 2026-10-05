-- ============================================================================
-- Logo par magasin — affiché dans l'app ET sur la carte de fidélité publique.
-- ----------------------------------------------------------------------------
-- Le patron (admin) téléverse le logo de SON magasin. Stockage dans un bucket
-- Storage PUBLIC `logos` (lecture publique, car la carte de fidélité est ouverte
-- en anon), écriture réservée à l'admin du magasin (chemin préfixé par le
-- magasin_id, cloisonnement identique aux justificatifs).
--
-- Sécurité : un admin NE PEUT PAS écrire directement sur `magasins` (policy
-- `magasins_superadmin` = superadmin uniquement). L'enregistrement du chemin
-- passe donc par une fonction SECURITY DEFINER bornée à est_admin() +
-- mon_magasin(). Aucune autre colonne de `magasins` n'est exposée.
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

alter table public.magasins add column if not exists logo text;

-- Bucket public dédié aux logos.
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = true;

-- Lecture : publique (la carte de fidélité est ouverte en anon).
drop policy if exists logos_select on storage.objects;
create policy logos_select on storage.objects for select to anon, authenticated
  using (bucket_id = 'logos');

-- Écriture : admin du magasin uniquement, chemin = <magasin_id>/<fichier>.
drop policy if exists logos_insert on storage.objects;
create policy logos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos'
    and public.est_admin()
    and (storage.foldername(name))[1] = public.mon_magasin()::text
  );
drop policy if exists logos_update on storage.objects;
create policy logos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'logos'
    and public.est_admin()
    and (storage.foldername(name))[1] = public.mon_magasin()::text
  )
  with check (
    bucket_id = 'logos'
    and public.est_admin()
    and (storage.foldername(name))[1] = public.mon_magasin()::text
  );
drop policy if exists logos_delete on storage.objects;
create policy logos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'logos'
    and public.est_admin()
    and (storage.foldername(name))[1] = public.mon_magasin()::text
  );

-- Enregistre / efface le chemin du logo sur le magasin de l'appelant (admin).
create or replace function public.magasin_logo_set(p_chemin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin() then raise exception 'non autorisé'; end if;
  update public.magasins
     set logo = nullif(btrim(p_chemin), '')
   where id = public.mon_magasin();
end; $$;
revoke execute on function public.magasin_logo_set(text) from public, anon;
grant execute on function public.magasin_logo_set(text) to authenticated;

-- La carte publique (anon) renvoie aussi le chemin du logo pour l'afficher.
-- (Ajout d'une colonne au RETURNS TABLE → on doit recréer la fonction.)
drop function if exists public.fidelite_token(uuid, int);
create or replace function public.fidelite_token(p_client uuid, p_ttl_sec int default 60)
returns table (token uuid, surnom text, tampons int, palier int, magasin text, logo text)
language plpgsql security definer set search_path = public as $$
declare v_tok uuid; v_age interval;
begin
  select fid_token, now() - fid_token_maj into v_tok, v_age
  from public.clients where id = p_client;
  if not found then return; end if;

  if v_age > make_interval(secs => greatest(p_ttl_sec, 5)) then
    update public.clients
       set fid_token = gen_random_uuid(), fid_token_maj = now()
     where id = p_client
     returning fid_token into v_tok;
  end if;

  return query
    select v_tok, c.surnom, c.tampons, m.fidelite_palier, m.nom, m.logo
    from public.clients c
    join public.magasins m on m.id = c.magasin_id
    where c.id = p_client;
end; $$;
grant execute on function public.fidelite_token(uuid, int) to anon, authenticated;
