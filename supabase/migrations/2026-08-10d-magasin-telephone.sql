-- Numéro de téléphone du magasin (affiché sur la carte de fidélité, cliquable).
-- On étend magasin_infos_set (édition admin) et magasin_infos_carte (public).

alter table public.magasins add column if not exists telephone text;

-- magasin_infos_set : ajoute le téléphone (nouvelle signature à 3 args).
drop function if exists public.magasin_infos_set(text, jsonb);

create or replace function public.magasin_infos_set(p_adresse text, p_telephone text, p_horaires jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.est_admin() then raise exception 'non autorisé'; end if;
  if p_horaires is not null and jsonb_typeof(p_horaires) <> 'object' then
    raise exception 'horaires invalides';
  end if;
  update public.magasins
     set adresse = nullif(btrim(p_adresse), ''),
         telephone = nullif(btrim(p_telephone), ''),
         horaires = p_horaires
   where id = public.mon_magasin();
end;
$$;

grant execute on function public.magasin_infos_set(text, text, jsonb) to authenticated;

-- magasin_infos_carte : renvoie aussi le téléphone (public, anon).
drop function if exists public.magasin_infos_carte(uuid);

create or replace function public.magasin_infos_carte(p_client uuid)
returns table(nom text, adresse text, telephone text, horaires jsonb)
language sql
stable
security definer
set search_path to 'public'
as $$
  select m.nom, m.adresse, m.telephone, m.horaires
  from public.clients c
  join public.magasins m on m.id = c.magasin_id
  where c.id = p_client;
$$;

revoke all on function public.magasin_infos_carte(uuid) from public;
grant execute on function public.magasin_infos_carte(uuid) to anon, authenticated;
