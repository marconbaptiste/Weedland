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

-- Vérifications croisées caisse_jour <-> caisse_partage en SECURITY DEFINER :
-- contournent la RLS pour éviter une récursion infinie entre les deux policies.
create or replace function public.est_coparticipant(p_caisse uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.caisse_partage
    where caisse_id = p_caisse and employe_id = auth.uid()
  );
$$;

create or replace function public.est_proprietaire_caisse(p_caisse uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.caisse_jour
    where id = p_caisse and employe_id = auth.uid()
  );
$$;

-- Activation de la RLS sur toutes les tables.
alter table public.users               enable row level security;
alter table public.clients             enable row level security;
alter table public.caisse_jour         enable row level security;
alter table public.chromes             enable row level security;
alter table public.paiements_employes  enable row level security;
alter table public.caisse_partage      enable row level security;
alter table public.charges             enable row level security;
alter table public.fournisseurs        enable row level security;
alter table public.parametres          enable row level security;
alter table public.fiches_paie         enable row level security;
alter table public.promos              enable row level security;

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
  using (
    employe_id = auth.uid()
    or public.est_admin()
    or public.est_coparticipant(id)
  );

drop policy if exists caisse_insert on public.caisse_jour;
create policy caisse_insert on public.caisse_jour for insert to authenticated
  with check (employe_id = auth.uid() or public.est_admin());

drop policy if exists caisse_update on public.caisse_jour;
create policy caisse_update on public.caisse_jour for update to authenticated
  using (employe_id = auth.uid() or public.est_admin())
  with check (employe_id = auth.uid() or public.est_admin());

drop policy if exists caisse_delete on public.caisse_jour;
create policy caisse_delete on public.caisse_jour for delete to authenticated
  using (employe_id = auth.uid() or public.est_admin());

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

-- ---------------------------------------------------------------------------
-- caisse_partage : géré par le propriétaire de la clôture (ou l'admin) ;
-- visible aussi par le co-participant concerné.
-- ---------------------------------------------------------------------------
drop policy if exists partage_select on public.caisse_partage;
create policy partage_select on public.caisse_partage for select to authenticated
  using (
    employe_id = auth.uid()
    or public.est_admin()
    or public.est_proprietaire_caisse(caisse_id)
  );

drop policy if exists partage_insert on public.caisse_partage;
create policy partage_insert on public.caisse_partage for insert to authenticated
  with check (
    public.est_admin()
    or public.est_proprietaire_caisse(caisse_id)
  );

drop policy if exists partage_delete on public.caisse_partage;
create policy partage_delete on public.caisse_partage for delete to authenticated
  using (
    public.est_admin()
    or public.est_proprietaire_caisse(caisse_id)
  );

-- ---------------------------------------------------------------------------
-- charges / fournisseurs : données financières réservées à l'admin.
-- ---------------------------------------------------------------------------
drop policy if exists charges_admin on public.charges;
create policy charges_admin on public.charges for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

drop policy if exists fournisseurs_admin on public.fournisseurs;
create policy fournisseurs_admin on public.fournisseurs for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

drop policy if exists parametres_admin on public.parametres;
create policy parametres_admin on public.parametres for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

drop policy if exists fiches_paie_admin on public.fiches_paie;
create policy fiches_paie_admin on public.fiches_paie for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- ---------------------------------------------------------------------------
-- promos : registre partagé (lecture/saisie par tout employé connecté).
-- ---------------------------------------------------------------------------
drop policy if exists promos_select on public.promos;
create policy promos_select on public.promos for select to authenticated
  using (true);

drop policy if exists promos_insert on public.promos;
create policy promos_insert on public.promos for insert to authenticated
  with check (employe_id = auth.uid() or public.est_admin());

drop policy if exists promos_update on public.promos;
create policy promos_update on public.promos for update to authenticated
  using (employe_id = auth.uid() or public.est_admin())
  with check (employe_id = auth.uid() or public.est_admin());

drop policy if exists promos_delete on public.promos;
create policy promos_delete on public.promos for delete to authenticated
  using (employe_id = auth.uid() or public.est_admin());

-- ---------------------------------------------------------------------------
-- stocks : registre partagé (lecture / saisie / ajustement par tout employé).
-- Suppression réservée à l'admin.
-- ---------------------------------------------------------------------------
alter table public.stocks enable row level security;

drop policy if exists stocks_select on public.stocks;
create policy stocks_select on public.stocks for select to authenticated
  using (true);

drop policy if exists stocks_insert on public.stocks;
create policy stocks_insert on public.stocks for insert to authenticated
  with check (true);

drop policy if exists stocks_update on public.stocks;
create policy stocks_update on public.stocks for update to authenticated
  using (true) with check (true);

drop policy if exists stocks_delete on public.stocks;
create policy stocks_delete on public.stocks for delete to authenticated
  using (public.est_admin());
