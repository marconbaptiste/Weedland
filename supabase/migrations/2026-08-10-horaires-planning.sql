-- Horaires & coordonnées du magasin + horaires fixes des employés (planning).
-- - magasins.adresse / magasins.horaires : coordonnées et horaires d'ouverture
--   (jsonb par jour de semaine ISO "1".."7" → {ouvert, debut, fin}).
-- - users.horaires_fixes : horaires hebdomadaires fixes de l'employé
--   (jsonb "1".."7" → {travaille, debut, fin}). Base du planning, ajustable
--   jour par jour ensuite.
--
-- Sécurité :
-- - magasins n'est modifiable QUE par le superadmin (policy). L'admin passe donc
--   par la fonction SECURITY DEFINER `magasin_infos_set` (bornée est_admin +
--   mon_magasin), comme `magasin_logo_set`. Pas d'écriture inter-magasins.
-- - users.horaires_fixes s'écrit via la RLS existante `users_admin_update`
--   (est_admin + magasin_id = mon_magasin) : seul l'admin du magasin fixe les
--   horaires ; aucun accès pour l'anon ou un employé (est_admin() = false).

alter table public.magasins add column if not exists adresse text;
alter table public.magasins add column if not exists horaires jsonb;
alter table public.users add column if not exists horaires_fixes jsonb;

create or replace function public.magasin_infos_set(p_adresse text, p_horaires jsonb)
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
         horaires = p_horaires
   where id = public.mon_magasin();
end;
$$;

grant execute on function public.magasin_infos_set(text, jsonb) to authenticated;
