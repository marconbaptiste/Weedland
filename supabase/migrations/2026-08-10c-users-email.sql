-- Email de connexion sur le profil `users` : permet d'afficher/gérer l'email
-- autorisé directement dans la fiche de chaque compte (au lieu d'une liste
-- séparée). L'email vient de auth.users ; on le recopie sur public.users à la
-- création (trigger) et on backfille l'existant.
--
-- Sécurité : `users` n'est lisible que par soi-même, l'admin du magasin ou le
-- superadmin (policy users_select) — l'email n'est donc jamais exposé à l'anon,
-- et reste cloisonné par magasin. Colonne non liée au rôle/magasin → aucun
-- impact sur l'anti-escalade (trigger users_garde_role inchangé).

alter table public.users add column if not exists email text;

update public.users u
   set email = lower(au.email)
  from auth.users au
 where au.id = u.id
   and (u.email is null or u.email <> lower(au.email));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v public.comptes_autorises%rowtype;
begin
  select * into v from public.comptes_autorises where email = lower(new.email);
  if v.email is null then
    return new; -- email non autorisé : pas de profil, donc aucun accès.
  end if;
  insert into public.users (id, nom, role, pourcentage_interessement, magasin_id, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nom', split_part(new.email, '@', 1)),
    coalesce(v.role, 'employe'),               -- plus jamais le metadata client
    coalesce(v.pourcentage_interessement, 0),  -- idem
    v.magasin_id,
    lower(new.email))
  on conflict (id) do nothing;
  return new;
end; $function$;
