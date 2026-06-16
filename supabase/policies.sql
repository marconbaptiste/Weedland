-- ============================================================================
-- Weedland — Row Level Security (RLS)
-- À exécuter APRÈS schema.sql.
-- ============================================================================
-- Modèle de visibilité :
--   * EMPLOYÉ : voit/saisit SES clôtures de caisse et SES paiements reçus.
--               Le registre des chromes (clients + lignes) est PARTAGÉ : au
--               comptoir, n'importe quel employé doit pouvoir encaisser le
--               remboursement d'un client ou consulter sa dette.
--   * ADMIN   : accès complet (lecture/écriture) + gestion des comptes.
-- ============================================================================

-- Fonction d'aide : l'appelant est-il admin ?
-- SECURITY DEFINER => contourne la RLS de public.users (évite la récursion
-- d'une policy sur users qui interrogerait users).
create or replace function public.est_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  );
$$;

-- Activation de la RLS sur toutes les tables.
alter table public.users               enable row level security;
alter table public.clients             enable row level security;
alter table public.caisse_jour         enable row level security;
alter table public.chromes             enable row level security;
alter table public.paiements_employes  enable row level security;

-- ---------------------------------------------------------------------------
-- users : chacun voit son profil ; l'admin voit/gère tout.
-- ---------------------------------------------------------------------------
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (id = auth.uid() or public.est_admin());

drop policy if exists users_admin_insert on public.users;
create policy users_admin_insert on public.users for insert to authenticated
  with check (public.est_admin());

drop policy if exists users_admin_update on public.users;
create policy users_admin_update on public.users for update to authenticated
  using (public.est_admin()) with check (public.est_admin());

drop policy if exists users_admin_delete on public.users;
create policy users_admin_delete on public.users for delete to authenticated
  using (public.est_admin());

-- ---------------------------------------------------------------------------
-- clients : registre partagé. Lecture + création par tout employé connecté.
-- Modification / suppression réservées à l'admin (intégrité des noms).
-- ---------------------------------------------------------------------------
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated
  using (true);

drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients for insert to authenticated
  with check (true);

drop policy if exists clients_admin_update on public.clients;
create policy clients_admin_update on public.clients for update to authenticated
  using (public.est_admin()) with check (public.est_admin());

drop policy if exists clients_admin_delete on public.clients;
create policy clients_admin_delete on public.clients for delete to authenticated
  using (public.est_admin());

-- ---------------------------------------------------------------------------
-- caisse_jour : un employé ne voit/gère QUE ses propres clôtures.
-- ---------------------------------------------------------------------------
drop policy if exists caisse_select on public.caisse_jour;
create policy caisse_select on public.caisse_jour for select to authenticated
  using (employe_id = auth.uid() or public.est_admin());

drop policy if exists caisse_insert on public.caisse_jour;
create policy caisse_insert on public.caisse_jour for insert to authenticated
  with check (employe_id = auth.uid() or public.est_admin());

drop policy if exists caisse_update on public.caisse_jour;
create policy caisse_update on public.caisse_jour for update to authenticated
  using (employe_id = auth.uid() or public.est_admin())
  with check (employe_id = auth.uid() or public.est_admin());

drop policy if exists caisse_delete on public.caisse_jour;
create policy caisse_delete on public.caisse_jour for delete to authenticated
  using (public.est_admin());

-- ---------------------------------------------------------------------------
-- chromes : registre partagé en lecture. Toute saisie est attribuée à
-- l'employé connecté (employe_id = auth.uid()). Corrections par le saisisseur
-- ou l'admin.
-- ---------------------------------------------------------------------------
drop policy if exists chromes_select on public.chromes;
create policy chromes_select on public.chromes for select to authenticated
  using (true);

drop policy if exists chromes_insert on public.chromes;
create policy chromes_insert on public.chromes for insert to authenticated
  with check (employe_id = auth.uid() or public.est_admin());

drop policy if exists chromes_update on public.chromes;
create policy chromes_update on public.chromes for update to authenticated
  using (employe_id = auth.uid() or public.est_admin())
  with check (employe_id = auth.uid() or public.est_admin());

drop policy if exists chromes_delete on public.chromes;
create policy chromes_delete on public.chromes for delete to authenticated
  using (employe_id = auth.uid() or public.est_admin());

-- ---------------------------------------------------------------------------
-- paiements_employes : l'employé voit ses propres paiements ; l'admin gère tout.
-- ---------------------------------------------------------------------------
drop policy if exists paiements_select on public.paiements_employes;
create policy paiements_select on public.paiements_employes for select to authenticated
  using (employe_id = auth.uid() or public.est_admin());

drop policy if exists paiements_admin_insert on public.paiements_employes;
create policy paiements_admin_insert on public.paiements_employes for insert to authenticated
  with check (public.est_admin());

drop policy if exists paiements_admin_update on public.paiements_employes;
create policy paiements_admin_update on public.paiements_employes for update to authenticated
  using (public.est_admin()) with check (public.est_admin());

drop policy if exists paiements_admin_delete on public.paiements_employes;
create policy paiements_admin_delete on public.paiements_employes for delete to authenticated
  using (public.est_admin());
