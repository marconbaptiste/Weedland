-- Migration — hygiène (analyseur de sécurité Supabase, passe « commercialisation »).
-- 1) Deux fonctions de trigger SECURITY DEFINER sans search_path figé.
alter function public.clients_garde_insert() set search_path = public;
alter function public.messages_garde_update() set search_path = public;

-- 2) Fonctions internes (helpers de policies / triggers) inutilement exécutables
--    par `anon` : aucune n'est appelée depuis la carte publique.
revoke execute on function public.est_coparticipant(uuid) from anon;
revoke execute on function public.est_proprietaire_caisse(uuid) from anon;
revoke execute on function public.liste_courses_auteur() from anon;
revoke execute on function public.stock_mvt_auteur() from anon;

-- Les autres avertissements « SECURITY DEFINER exécutable par anon/authenticated »
-- sont VOLONTAIRES et documentés (carte de fidélité publique, inscription client,
-- fonctions bornées est_membre()/est_admin()/mon_magasin()). Reste à activer dans
-- le Dashboard : Authentication → « Leaked password protection » (HaveIBeenPwned).
