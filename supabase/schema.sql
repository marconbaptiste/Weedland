-- ============================================================================
-- Weedland — Schéma de base de données (PostgreSQL / Supabase)
-- À exécuter dans l'éditeur SQL Supabase. Exécuter ensuite policies.sql.
-- ============================================================================
-- Conventions :
--   * Montants en euros stockés en numeric(10,2). Les calculs sensibles sont
--     refaits côté application en centimes (voir src/lib/comptabilite.js).
--   * Le CA du jour n'est JAMAIS stocké : il est calculé via la vue v_ca_jour
--     à partir de caisse_jour + chromes du jour.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- users : profil applicatif lié à auth.users (1-1). Porte le rôle métier.
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id         uuid primary key references auth.users (id) on delete cascade,
  nom        text not null,
  role       text not null default 'employe' check (role in ('employe', 'admin')),
  -- Taux d'intéressement par défaut de l'employé (% du CA), fixé par l'admin.
  pourcentage_interessement numeric(5, 2) not null default 0 check (pourcentage_interessement >= 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- clients : RGPD — on n'enregistre JAMAIS de nom/prénom réel. Uniquement un
-- surnom et une description interne (visibles seulement par le personnel via
-- la RLS). Le solde est calculé (v_solde_client).
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  surnom      text not null,
  description text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- caisse_jour : clôture de caisse d'un employé pour une journée donnée.
-- "especes" correspond au champ "Moro" de l'interface.
-- Une seule clôture par (employé, date).
-- ---------------------------------------------------------------------------
create table if not exists public.caisse_jour (
  id              uuid primary key default gen_random_uuid(),
  date            date not null,
  employe_id      uuid not null references public.users (id) on delete restrict,
  ventes_directes numeric(10, 2) not null default 0 check (ventes_directes >= 0),
  cb              numeric(10, 2) not null default 0 check (cb >= 0),
  especes         numeric(10, 2) not null default 0 check (especes >= 0),
  fond_caisse     numeric(10, 2) not null default 0 check (fond_caisse >= 0),
  -- Heures travaillées et taux d'intéressement appliqué ce jour-là (pré-rempli
  -- depuis la fiche employé mais ajustable, notamment pour les journées partagées).
  heures_travaillees        numeric(5, 2) not null default 0 check (heures_travaillees >= 0),
  pourcentage_interessement numeric(5, 2) not null default 0 check (pourcentage_interessement >= 0),
  commentaire     text,
  created_at      timestamptz not null default now(),
  unique (employe_id, date)
);

-- ---------------------------------------------------------------------------
-- chromes : lignes d'avances (+) et de remboursements (-) par client.
-- Chaque ligne est rattachée à l'employé qui l'a saisie et alimente le CA
-- du jour correspondant.
-- ---------------------------------------------------------------------------
create table if not exists public.chromes (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients (id) on delete restrict,
  type       text not null check (type in ('avance', 'remboursement')),
  montant    numeric(10, 2) not null check (montant > 0),
  date       date not null,
  employe_id uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- paiements_employes : versements faits à un employé (géré par l'admin).
-- ---------------------------------------------------------------------------
create table if not exists public.paiements_employes (
  id         uuid primary key default gen_random_uuid(),
  employe_id uuid not null references public.users (id) on delete restrict,
  montant    numeric(10, 2) not null check (montant > 0),
  motif      text,
  date       date not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- caisse_partage : co-participants d'une clôture partagée (journée travaillée
-- en même temps par plusieurs employés). Le propriétaire de la clôture n'y
-- figure pas. L'intéressement se calcule sur (CA ÷ nombre de personnes).
-- ---------------------------------------------------------------------------
create table if not exists public.caisse_partage (
  caisse_id          uuid not null references public.caisse_jour (id) on delete cascade,
  employe_id         uuid not null references public.users (id) on delete restrict,
  heures_travaillees numeric(5, 2) not null default 0 check (heures_travaillees >= 0),
  created_at         timestamptz not null default now(),
  primary key (caisse_id, employe_id)
);
create index if not exists idx_caisse_partage_employe on public.caisse_partage (employe_id);

-- ---------------------------------------------------------------------------
-- charges / fournisseurs : postes de dépenses mensuels (réservés admin).
-- Sert au calcul du bénéfice = CA − charges − fournisseurs.
-- ---------------------------------------------------------------------------
create table if not exists public.charges (
  id          uuid primary key default gen_random_uuid(),
  libelle     text not null default '',
  montant     numeric(10, 2) not null default 0,
  mois        date not null,
  justificatif text,            -- chemin dans le bucket Storage "justificatifs"
  created_at  timestamptz not null default now()
);
create index if not exists idx_charges_mois on public.charges (mois);

create table if not exists public.fournisseurs (
  id          uuid primary key default gen_random_uuid(),
  libelle     text not null default '',
  montant     numeric(10, 2) not null default 0,
  mois        date not null,
  justificatif text,            -- chemin dans le bucket Storage "justificatifs"
  created_at  timestamptz not null default now()
);
create index if not exists idx_fournisseurs_mois on public.fournisseurs (mois);

-- ---------------------------------------------------------------------------
-- parametres : clé/valeur JSONB (mémorise l'employeur). fiches_paie : bulletins
-- de paie (contenu en JSONB). Réservés à l'admin.
-- ---------------------------------------------------------------------------
create table if not exists public.parametres (
  cle        text primary key,
  valeur     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.fiches_paie (
  id         uuid primary key default gen_random_uuid(),
  employe_id uuid not null references public.users (id) on delete restrict,
  mois       date not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employe_id, mois)
);
create index if not exists idx_fiches_paie_employe on public.fiches_paie (employe_id);

-- ---------------------------------------------------------------------------
-- promos : promotions / traitements de faveur accordés à un client.
-- Registre partagé entre employés (comme clients/chromes).
-- ---------------------------------------------------------------------------
create table if not exists public.promos (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  description text not null,
  date        date not null,
  employe_id  uuid not null references public.users (id) on delete restrict,
  created_at  timestamptz not null default now()
);
create index if not exists idx_promos_client on public.promos (client_id);

-- Index utiles pour les filtres jour / employé.
create index if not exists idx_caisse_jour_date on public.caisse_jour (date);
create index if not exists idx_caisse_jour_employe on public.caisse_jour (employe_id);
create index if not exists idx_chromes_date on public.chromes (date);
create index if not exists idx_chromes_client on public.chromes (client_id);
create index if not exists idx_chromes_employe on public.chromes (employe_id);
create index if not exists idx_paiements_employe on public.paiements_employes (employe_id);

-- ============================================================================
-- VUES CALCULÉES (security_invoker = on => respectent la RLS de l'appelant)
-- ============================================================================

-- Agrégat des chromes par (date, employé).
create or replace view public.v_chromes_jour
with (security_invoker = on) as
select
  date,
  employe_id,
  coalesce(sum(montant) filter (where type = 'avance'), 0)        as avances,
  coalesce(sum(montant) filter (where type = 'remboursement'), 0) as remboursements
from public.chromes
group by date, employe_id;

-- CA du jour par clôture de caisse. C'est LA traduction SQL de la règle métier.
--   ca_jour        = ventes_directes + avances - remboursements
--   encaissements  = cb + especes (argent réellement entré)
--   attendu        = ventes_directes + remboursements (ce qui DOIT être en caisse)
--   ecart          = encaissements - attendu (0 => cohérent)
drop view if exists public.v_interessement_employe;
drop view if exists public.v_ca_jour;
create view public.v_ca_jour
with (security_invoker = on) as
select
  c.id          as caisse_id,
  c.date,
  c.employe_id,
  c.ventes_directes,
  c.cb,
  c.especes,
  c.fond_caisse,
  c.heures_travaillees,
  c.pourcentage_interessement,
  1 + (select count(*) from public.caisse_partage p where p.caisse_id = c.id) as nb_partageurs,
  coalesce(ch.avances, 0)        as avances,
  coalesce(ch.remboursements, 0) as remboursements,
  c.ventes_directes + coalesce(ch.avances, 0) - coalesce(ch.remboursements, 0) as ca_jour,
  c.cb + c.especes                                                             as encaissements,
  c.ventes_directes + coalesce(ch.remboursements, 0)                           as encaissements_attendus,
  (c.cb + c.especes) - (c.ventes_directes + coalesce(ch.remboursements, 0))    as ecart,
  round(
    (c.ventes_directes + coalesce(ch.avances, 0) - coalesce(ch.remboursements, 0))
      / (1 + (select count(*) from public.caisse_partage p where p.caisse_id = c.id))
      * c.pourcentage_interessement / 100,
    2
  ) as interessement
from public.caisse_jour c
left join public.v_chromes_jour ch
  on ch.date = c.date and ch.employe_id = c.employe_id;

-- Lignes d'intéressement par employé : propriétaires de clôture + co-participants.
create view public.v_interessement_employe
with (security_invoker = on) as
select
  c.employe_id, c.caisse_id, c.date, true as est_proprietaire,
  c.heures_travaillees, c.pourcentage_interessement,
  c.ca_jour, c.encaissements, c.ecart, c.interessement
from public.v_ca_jour c
union all
select
  p.employe_id, c.caisse_id, c.date, false as est_proprietaire,
  p.heures_travaillees, u.pourcentage_interessement,
  null::numeric, null::numeric, null::numeric,
  round(c.ca_jour / c.nb_partageurs * u.pourcentage_interessement / 100, 2)
from public.caisse_partage p
join public.v_ca_jour c on c.caisse_id = p.caisse_id
join public.users u on u.id = p.employe_id;

-- Liste minimale des collègues (id + nom) pour le sélecteur de partage.
-- Fonction SECURITY DEFINER (et non une vue definer, signalée « critique » par
-- l'analyseur Supabase) : n'expose que id + nom, sans le reste de users.
drop view if exists public.v_collegues;
create or replace function public.collegues()
returns table (id uuid, nom text)
language sql
stable
security definer
set search_path = public
as $$
  select id, nom from public.users order by nom;
$$;
grant execute on function public.collegues() to authenticated;

-- IMPORTANT : un DROP VIEW supprime les droits SELECT. On (re)donne explicitement
-- l'accès en lecture aux vues pour les rôles applicatifs (la RLS des tables
-- sous-jacentes reste appliquée via security_invoker).
grant select on
  public.v_chromes_jour,
  public.v_ca_jour,
  public.v_interessement_employe
to anon, authenticated;

-- Solde dû par client (Σ avances - Σ remboursements).
create or replace view public.v_solde_client
with (security_invoker = on) as
select
  cl.id  as client_id,
  cl.surnom,
  cl.description,
  coalesce(sum(ch.montant) filter (where ch.type = 'avance'), 0)
    - coalesce(sum(ch.montant) filter (where ch.type = 'remboursement'), 0) as solde
from public.clients cl
left join public.chromes ch on ch.client_id = cl.id
group by cl.id, cl.surnom, cl.description;
grant select on public.v_solde_client to anon, authenticated;

-- ============================================================================
-- DÉCLENCHEUR : crée automatiquement le profil public.users à l'inscription.
-- Le nom vient de raw_user_meta_data.nom (passé à signUp) sinon de l'email.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, nom, role, pourcentage_interessement)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nom', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'employe'),
    coalesce((new.raw_user_meta_data ->> 'pourcentage_interessement')::numeric, 0)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
