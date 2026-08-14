-- ============================================================================
-- Livraisons : adresse sur la fiche client + bons de commande.
-- ----------------------------------------------------------------------------
-- 1) `clients.adresse` — adresse de livraison du client (RGPD : renseignée avec
--    son accord, comme le téléphone ; visible uniquement des membres du magasin
--    via la RLS, jamais exposée en anon). Éditable par tout membre via la
--    fonction partagée `client_maj` (étendue), exposée par `v_solde_client`.
-- 2) `commandes` — bons de commande (livraison) : montant, payée ou pas et
--    comment (mode de paiement), statut en_cours → traitee → envoyee, note
--    affichée sur l'accueil tant que la commande n'est pas traitée.
--    Registre PARTAGÉ du magasin (comme chromes/clients) : tout membre lit,
--    crée, met à jour et supprime — cloisonné par magasin_id via la RLS.
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

-- 1) Adresse sur la fiche client -------------------------------------------
alter table public.clients add column if not exists adresse text;

-- `client_maj` passe de 4 à 5 arguments (on supprime l'ancienne signature pour
-- éviter toute ambiguïté de résolution PostgREST).
drop function if exists public.client_maj(uuid, text, text, text);
create or replace function public.client_maj(
  p_client    uuid,
  p_surnom    text,
  p_telephone text,
  p_note      text,
  p_adresse   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_membre() then
    raise exception 'non autorisé';
  end if;
  update public.clients
     set surnom      = coalesce(nullif(btrim(p_surnom), ''), surnom), -- surnom jamais vidé
         telephone   = nullif(btrim(p_telephone), ''),
         description = nullif(btrim(p_note), ''),
         adresse     = nullif(btrim(p_adresse), '')
   where id = p_client
     and magasin_id = public.mon_magasin();                          -- cloisonnement
end; $$;
revoke execute on function public.client_maj(uuid, text, text, text, text) from public, anon;
grant execute on function public.client_maj(uuid, text, text, text, text) to authenticated;

-- v_solde_client expose l'adresse (security_invoker : la RLS de l'appelant s'applique).
create or replace view public.v_solde_client
with (security_invoker = on) as
select
  cl.id  as client_id,
  cl.surnom,
  cl.description,
  coalesce(sum(ch.montant) filter (where ch.type = 'avance'), 0)
    - coalesce(sum(ch.montant) filter (where ch.type = 'remboursement'), 0) as solde,
  cl.telephone,
  cl.adresse
from public.clients cl
left join public.chromes ch on ch.client_id = cl.id
group by cl.id, cl.surnom, cl.description, cl.telephone, cl.adresse;
grant select on public.v_solde_client to authenticated;
revoke select on public.v_solde_client from anon;

-- 2) Bons de commande --------------------------------------------------------
create table if not exists public.commandes (
  id uuid primary key default gen_random_uuid(),
  magasin_id uuid not null default public.mon_magasin() references public.magasins(id),
  client_id uuid not null references public.clients(id) on delete cascade,
  employe_id uuid not null default auth.uid() references public.users(id),
  montant numeric(10,2) not null default 0,
  payee boolean not null default false,
  mode_paiement text check (mode_paiement in ('cb','especes','virement','autre')),
  statut text not null default 'en_cours' check (statut in ('en_cours','traitee','envoyee')),
  note text,
  adresse_livraison text,
  created_at timestamptz not null default now()
);

create index if not exists commandes_magasin_statut on public.commandes (magasin_id, statut, created_at desc);

alter table public.commandes enable row level security;

-- Registre partagé du magasin (comme chromes) : tout membre gère les commandes,
-- cloisonné par magasin. Le with check verrouille magasin_id = mon_magasin()
-- (le défaut le remplit) — aucune écriture inter-magasin possible.
drop policy if exists commandes_select on public.commandes;
create policy commandes_select on public.commandes
  for select to authenticated
  using (public.est_membre() and magasin_id = public.mon_magasin());

drop policy if exists commandes_insert on public.commandes;
create policy commandes_insert on public.commandes
  for insert to authenticated
  with check (public.est_membre() and magasin_id = public.mon_magasin());

drop policy if exists commandes_update on public.commandes;
create policy commandes_update on public.commandes
  for update to authenticated
  using (public.est_membre() and magasin_id = public.mon_magasin())
  with check (public.est_membre() and magasin_id = public.mon_magasin());

drop policy if exists commandes_delete on public.commandes;
create policy commandes_delete on public.commandes
  for delete to authenticated
  using (public.est_membre() and magasin_id = public.mon_magasin());
