-- Bons de commande : statut « annulee » (annulation SANS suppression — on garde
-- la trace de la commande annulée, réouvrable en cas d'erreur via « Revenir »).
-- À exécuter dans l'éditeur SQL Supabase.
alter table public.commandes drop constraint if exists commandes_statut_check;
alter table public.commandes add constraint commandes_statut_check
  check (statut in ('en_cours','traitee','envoyee','annulee'));
