-- ============================================================================
-- Migration — Justificatifs : cloisonnement par magasin (fuite inter-magasins).
-- ----------------------------------------------------------------------------
-- Avant : les policies du bucket privé `justificatifs` ne vérifiaient que
-- `est_admin()`, sans magasin_id, et les chemins (`charges/<id>.jpg`) ne
-- portaient pas le magasin → tout admin pouvait lister/lire/écraser/supprimer
-- les factures de N'IMPORTE QUEL magasin.
-- Après : le 1er segment du chemin DOIT être le magasin de l'appelant
-- (`<magasin_id>/charges/<id>.jpg`). Le front (Comptabilite.jsx) préfixe
-- désormais les uploads par magasin_id.
--
-- NB migration des fichiers existants : les justificatifs déjà stockés sous
-- l'ancien chemin (`charges/…`, `fournisseurs/…`) ne seront plus lisibles sous
-- la nouvelle policy. Comme le multi-magasin vient d'être introduit, ils
-- appartiennent tous au magasin d'origine ; ré-uploader la photo depuis la
-- Comptabilité régénère le chemin cloisonné. (Pas de déplacement automatique :
-- renommer storage.objects.name en SQL ne déplace pas le blob physique.)
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

drop policy if exists justificatifs_select on storage.objects;
create policy justificatifs_select on storage.objects for select to authenticated
  using (
    bucket_id = 'justificatifs'
    and public.est_admin()
    and (storage.foldername(name))[1] = public.mon_magasin()::text
  );

drop policy if exists justificatifs_insert on storage.objects;
create policy justificatifs_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'justificatifs'
    and public.est_admin()
    and (storage.foldername(name))[1] = public.mon_magasin()::text
  );

drop policy if exists justificatifs_update on storage.objects;
create policy justificatifs_update on storage.objects for update to authenticated
  using (
    bucket_id = 'justificatifs'
    and public.est_admin()
    and (storage.foldername(name))[1] = public.mon_magasin()::text
  )
  with check (
    bucket_id = 'justificatifs'
    and public.est_admin()
    and (storage.foldername(name))[1] = public.mon_magasin()::text
  );

drop policy if exists justificatifs_delete on storage.objects;
create policy justificatifs_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'justificatifs'
    and public.est_admin()
    and (storage.foldername(name))[1] = public.mon_magasin()::text
  );
