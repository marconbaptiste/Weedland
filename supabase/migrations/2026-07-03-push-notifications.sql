-- ============================================================================
-- Notifications push (Web Push) sur la carte de fidélité.
-- ----------------------------------------------------------------------------
-- Un client qui a ajouté sa carte à l'écran d'accueil peut ACCEPTER les
-- notifications : le navigateur crée un abonnement push (endpoint + clés) qu'on
-- stocke ici, lié à son client + son magasin. L'admin envoie ensuite un message
-- (promo, objet oublié…) via l'Edge Function `envoyer-push` (clés VAPID).
--
-- Sécurité :
--  - La table n'est jamais exposée au front (RLS activée, aucune policy) : seul
--    le service_role (Edge Function d'envoi) la lit, et l'enregistrement passe
--    par la fonction SECURITY DEFINER `push_enregistrer` (dérive le magasin du
--    client → pas d'usurpation de magasin, cloisonné).
--  - Endpoint UNIQUE : un même appareil = un seul abonnement (upsert).
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

create table if not exists public.push_abonnements (
  id         bigint generated always as identity primary key,
  magasin_id uuid not null,
  client_id  uuid references public.clients(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_magasin on public.push_abonnements (magasin_id);

alter table public.push_abonnements enable row level security;
-- Aucune policy : lecture réservée au service_role (Edge Function), écriture via
-- la fonction SECURITY DEFINER ci-dessous. La RLS refuse tout accès direct.

-- Enregistre / met à jour l'abonnement push d'un client (appelé par la carte,
-- publique → anon). Le magasin est dérivé du client (jamais fourni par le front).
create or replace function public.push_enregistrer(
  p_client   uuid,
  p_endpoint text,
  p_p256dh   text,
  p_auth     text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_mag uuid;
begin
  select magasin_id into v_mag from public.clients where id = p_client;
  if v_mag is null then raise exception 'client introuvable'; end if;
  insert into public.push_abonnements (magasin_id, client_id, endpoint, p256dh, auth)
  values (v_mag, p_client, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set client_id = excluded.client_id,
        magasin_id = excluded.magasin_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth;
end; $$;
revoke execute on function public.push_enregistrer(uuid, text, text, text) from public;
grant execute on function public.push_enregistrer(uuid, text, text, text) to anon, authenticated;

-- Désinscription (si le client refuse / retire l'autorisation).
create or replace function public.push_desactiver(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_abonnements where endpoint = p_endpoint;
$$;
revoke execute on function public.push_desactiver(text) from public;
grant execute on function public.push_desactiver(text) to anon, authenticated;
