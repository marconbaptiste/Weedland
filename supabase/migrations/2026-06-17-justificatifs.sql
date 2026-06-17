-- ============================================================================
-- Migration — Justificatifs (photos de factures/tickets) sur charges/fournisseurs
-- Stockage : bucket privé "justificatifs" (Supabase Storage), réservé admin.
-- ============================================================================

-- 1. Colonne pour mémoriser le chemin du fichier dans le bucket.
alter table public.charges      add column if not exists justificatif text;
alter table public.fournisseurs add column if not exists justificatif text;

-- 2. Bucket de stockage privé.
insert into storage.buckets (id, name, public)
values ('justificatifs', 'justificatifs', false)
on conflict (id) do nothing;

-- 3. Accès au bucket réservé aux administrateurs (documents financiers).
drop policy if exists justificatifs_select on storage.objects;
create policy justificatifs_select on storage.objects for select to authenticated
  using (bucket_id = 'justificatifs' and public.est_admin());

drop policy if exists justificatifs_insert on storage.objects;
create policy justificatifs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'justificatifs' and public.est_admin());

drop policy if exists justificatifs_update on storage.objects;
create policy justificatifs_update on storage.objects for update to authenticated
  using (bucket_id = 'justificatifs' and public.est_admin())
  with check (bucket_id = 'justificatifs' and public.est_admin());

drop policy if exists justificatifs_delete on storage.objects;
create policy justificatifs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'justificatifs' and public.est_admin());
