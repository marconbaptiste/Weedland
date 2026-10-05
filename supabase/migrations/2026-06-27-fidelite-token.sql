-- ============================================================================
-- Migration — Fidélité : token à usage unique au scan (anti-replay / anti-partage).
-- ----------------------------------------------------------------------------
-- Problème : le QR de la carte encodait seulement /carte/<UUID>, CONSTANT à vie.
-- Un client pouvait partager une capture de son QR (les amis le font scanner →
-- toutes les étoiles tombent sur une carte) ou le rejouer plusieurs fois.
-- Solution (demande explicite du commerçant) : « un token valide une seule fois
-- au scan ; une inscription = un token = un client ; s'il recommence, nouveau QR ».
--   • Chaque carte porte un `fid_token` rotatif.
--   • La carte publique tire un token frais (rotation au-delà d'un TTL) → le QR
--     change tout seul ; une capture devient caduque au scan suivant ou au TTL.
--   • Le scan CONSOMME le token de façon ATOMIQUE (un seul gagnant) et le régénère.
--   • Tout stamping est journalisé (`fidelite_evenements`) → audit + détection.
--
-- Limite assumée (à dire au client) : le partage en PRÉSENCE simultanée (montrer
-- son écran vivant à côté) reste possible — seul un lien vers une vraie vente le
-- couperait. Le token tue le replay et la capture partagée, soit l'essentiel.
-- À exécuter dans l'éditeur SQL Supabase (après la migration fidélité).
-- ============================================================================

-- 1) Token courant par carte + horodatage de rotation.
alter table public.clients
  add column if not exists fid_token uuid not null default gen_random_uuid(),
  add column if not exists fid_token_maj timestamptz not null default now();

-- 2) Journal des stampings (audit / anti-triche / traçabilité).
create table if not exists public.fidelite_evenements (
  id         bigint generated always as identity primary key,
  client_id  uuid not null references public.clients(id) on delete cascade,
  magasin_id uuid not null,
  employe_id uuid,                          -- auth.uid() au moment du scan
  type       text not null check (type in ('ajout', 'retrait', 'recompense')),
  token      uuid,                           -- token consommé (null si ajout manuel)
  created_at timestamptz not null default now()
);
create index if not exists idx_fid_evt_client on public.fidelite_evenements (client_id, created_at);
alter table public.fidelite_evenements enable row level security;
-- Lecture cloisonnée par magasin (pour l'admin) ; écriture réservée aux
-- fonctions SECURITY DEFINER ci-dessous (aucune policy insert directe).
drop policy if exists fid_evt_select on public.fidelite_evenements;
create policy fid_evt_select on public.fidelite_evenements for select to authenticated
  using (magasin_id = public.mon_magasin());

-- 3) Carte publique (anon) : renvoie l'état + un token frais. Le token tourne
--    s'il est plus vieux que p_ttl_sec (rotation visible côté QR), sinon on
--    garde le même (laisse au personnel le temps de scanner).
create or replace function public.fidelite_token(p_client uuid, p_ttl_sec int default 60)
returns table (token uuid, surnom text, tampons int, palier int, magasin text)
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
    select v_tok, c.surnom, c.tampons, m.fidelite_palier, m.nom
    from public.clients c
    join public.magasins m on m.id = c.magasin_id
    where c.id = p_client;
end; $$;
grant execute on function public.fidelite_token(uuid, int) to anon, authenticated;

-- 4) Scan (personnel) : consomme le token, +1 tampon, journalise — le tout
--    ATOMIQUEMENT. La vérification du token ET sa rotation sont dans le même
--    UPDATE … WHERE fid_token = p_token : deux scans du même token → un seul
--    gagne, l'autre lève 'TOKEN_PERIME'. C'est l'anti-replay.
create or replace function public.fidelite_scanner(p_client uuid, p_token uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_mag uuid; v_tampons int;
begin
  if not public.est_membre() then raise exception 'non autorisé'; end if;

  update public.clients c
     set tampons = least(c.tampons + 1, m.fidelite_palier),
         fid_token = gen_random_uuid(),
         fid_token_maj = now()
    from public.magasins m
   where c.id = p_client
     and m.id = c.magasin_id
     and c.magasin_id = public.mon_magasin()
     and c.fid_token = p_token
   returning c.magasin_id, c.tampons into v_mag, v_tampons;

  if not found then
    raise exception 'TOKEN_PERIME'; -- mauvais magasin/inexistant, ou token déjà brûlé.
  end if;

  insert into public.fidelite_evenements (client_id, magasin_id, employe_id, type, token)
  values (p_client, v_mag, auth.uid(), 'ajout', p_token);

  return v_tampons;
end; $$;
grant execute on function public.fidelite_scanner(uuid, uuid) to authenticated;

-- 5) On journalise aussi les ajouts/retraits MANUELS (bouton « +1 personnel »,
--    correction) pour que l'audit soit complet et la triche interne détectable.
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
  insert into public.fidelite_evenements (client_id, magasin_id, employe_id, type)
  values (p_client, v_mag, auth.uid(), 'ajout');
  return v_tampons;
end; $$;

create or replace function public.fidelite_retirer(p_client uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_mag uuid; v_tampons int;
begin
  if not public.est_membre() then raise exception 'non autorisé'; end if;
  select magasin_id, greatest(tampons - 1, 0) into v_mag, v_tampons from public.clients where id = p_client;
  if v_mag is null or v_mag <> public.mon_magasin() then raise exception 'client introuvable'; end if;
  update public.clients set tampons = v_tampons where id = p_client;
  insert into public.fidelite_evenements (client_id, magasin_id, employe_id, type)
  values (p_client, v_mag, auth.uid(), 'retrait');
  return v_tampons;
end; $$;

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
  insert into public.fidelite_evenements (client_id, magasin_id, employe_id, type)
  values (p_client, v_mag, auth.uid(), 'recompense');
end; $$;
