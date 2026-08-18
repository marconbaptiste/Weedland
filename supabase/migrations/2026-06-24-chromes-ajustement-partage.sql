-- ============================================================================
-- Migration — Chromes : ajustement partagé entre employés.
-- ----------------------------------------------------------------------------
-- Le registre des chromes est PARTAGÉ au comptoir (lecture + saisie par tout
-- employé). On étend ce principe à la CORRECTION : n'importe quel membre du
-- magasin peut désormais MODIFIER et SUPPRIMER une ligne de chrome (y compris
-- celle d'un collègue), pas seulement son auteur ou l'admin.
--   - Toujours cloisonné par magasin (magasin_id = mon_magasin()).
--   - L'INSERT reste attribué à l'employé connecté (employe_id = auth.uid()).
-- À exécuter dans l'éditeur SQL Supabase (après multi-magasin).
-- ============================================================================

drop policy if exists chromes_update on public.chromes;
create policy chromes_update on public.chromes for update to authenticated
  using (public.est_membre() and magasin_id = public.mon_magasin())
  with check (public.est_membre() and magasin_id = public.mon_magasin());

drop policy if exists chromes_delete on public.chromes;
create policy chromes_delete on public.chromes for delete to authenticated
  using (public.est_membre() and magasin_id = public.mon_magasin());
