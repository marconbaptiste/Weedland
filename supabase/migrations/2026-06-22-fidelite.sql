-- ============================================================================
-- Migration — Fidélité : carte à tampons par client.
-- ----------------------------------------------------------------------------
-- Palier configurable par magasin (défaut 10). Compteur de tampons + récompenses
-- par client. Fonctions SECURITY DEFINER pour permettre aux employés de
-- tamponner sans ouvrir l'édition des clients (réservée à l'admin), tout en
-- restant cloisonné par magasin.
-- À exécuter dans l'éditeur SQL Supabase (après les migrations précédentes).
-- ============================================================================

alter table public.magasins add column if not exists fidelite_palier int not null default 10 check (fidelite_palier >= 1);
alter table public.clients  add column if not exists tampons     int not null default 0 check (tampons >= 0);
alter table public.clients  add column if not exists recompenses int not null default 0 check (recompenses >= 0);

-- +1 tampon (plafonné au palier). Renvoie le nouveau total.
create or replace function public.fidelite_ajouter(p_client uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_mag uuid; v_tampons int; v_palier int;
begin
  if not public.est_membre() then raise exception 'non autorisé'; end if;
  select magasin_id, tampons into v_mag, v_tampons from public.clients where id = p_client;
  if v_mag is null or v_mag <> public.mon_magasin() then raise exception 'client introuvable'; end if;
  select fidelite_palier into v_palier from public.magasins where id = v_mag;
  v_tampons := least(v_tampons + 1, v_palier);
  update public.clients set tampons = v_tampons where id = p_client;
  return v_tampons;
end; $$;

-- -1 tampon (correction). Renvoie le nouveau total.
create or replace function public.fidelite_retirer(p_client uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_mag uuid; v_tampons int;
begin
  if not public.est_membre() then raise exception 'non autorisé'; end if;
  select magasin_id, greatest(tampons - 1, 0) into v_mag, v_tampons from public.clients where id = p_client;
  if v_mag is null or v_mag <> public.mon_magasin() then raise exception 'client introuvable'; end if;
  update public.clients set tampons = v_tampons where id = p_client;
  return v_tampons;
end; $$;

-- Utilise la récompense (carte complète) : remet à zéro et incrémente le compteur.
create or replace function public.fidelite_utiliser(p_client uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_mag uuid; v_tampons int; v_palier int;
begin
  if not public.est_membre() then raise exception 'non autorisé'; end if;
  select magasin_id, tampons into v_mag, v_tampons from public.clients where id = p_client;
  if v_mag is null or v_mag <> public.mon_magasin() then raise exception 'client introuvable'; end if;
  select fidelite_palier into v_palier from public.magasins where id = v_mag;
  if v_tampons < v_palier then raise exception 'carte non complète'; end if;
  update public.clients set tampons = 0, recompenses = recompenses + 1 where id = p_client;
end; $$;

-- Définit le palier du magasin de l'appelant (admin uniquement).
create or replace function public.fidelite_palier(p_palier int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.est_admin() then raise exception 'réservé à l''admin'; end if;
  if p_palier < 1 then raise exception 'palier invalide'; end if;
  update public.magasins set fidelite_palier = p_palier where id = public.mon_magasin();
end; $$;

grant execute on function
  public.fidelite_ajouter(uuid),
  public.fidelite_retirer(uuid),
  public.fidelite_utiliser(uuid),
  public.fidelite_palier(int)
to authenticated;
