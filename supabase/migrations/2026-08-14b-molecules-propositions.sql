-- Validation humaine des mises a jour de la fiche molecules (table GLOBALE).
-- L'IA ne modifie plus `molecules` directement : chaque nouveaute / changement de
-- statut detecte par la recherche web devient une PROPOSITION, que le SUPERADMIN
-- (l'exploitant) approuve ou rejette depuis la page News. Seule l'approbation
-- applique le changement — plus aucun chemin automatique du web vers la reference
-- (ferme definitivement le vecteur prompt-injection releve par l'audit : une page
-- piegee ne peut plus alterer le statut legal affiche a tous les magasins).
create table if not exists public.molecules_propositions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  nom text,
  statut_actuel text,
  statut_propose text not null check (statut_propose in ('autorise','gris','interdit')),
  profil text,
  avis text,
  a_noter text,
  etat text not null default 'en_attente' check (etat in ('en_attente','approuvee','rejetee')),
  created_at timestamptz not null default now(),
  traite_le timestamptz,
  traite_par uuid
);

alter table public.molecules_propositions enable row level security;

-- Lecture : superadmin uniquement (c'est lui qui valide). Aucune policy
-- INSERT/UPDATE/DELETE pour les comptes : seules les ecritures service_role
-- (Edge Function) et la fonction de traitement ci-dessous passent.
drop policy if exists molprop_select on public.molecules_propositions;
create policy molprop_select on public.molecules_propositions
  for select to authenticated using (est_superadmin());

-- Une seule proposition en attente par molecule (anti-doublon).
create unique index if not exists molecules_propositions_attente
  on public.molecules_propositions (code) where etat = 'en_attente';

-- Traitement (approbation/rejet) par le superadmin. SECURITY DEFINER pour
-- pouvoir ecrire dans molecules (aucune policy d'ecriture client) tout en
-- verrouillant l'acces par est_superadmin().
create or replace function public.molecule_proposition_traiter(p_id uuid, p_accepter boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if not est_superadmin() then
    raise exception 'Réservé au superadmin';
  end if;
  select * into v from molecules_propositions where id = p_id and etat = 'en_attente' for update;
  if not found then
    raise exception 'Proposition introuvable ou déjà traitée';
  end if;
  if p_accepter then
    insert into molecules (code, nom, statut, profil, avis, a_noter, updated_at)
    values (v.code, coalesce(v.nom, v.code), v.statut_propose, v.profil, v.avis, v.a_noter, now())
    on conflict (code) do update set
      nom = coalesce(excluded.nom, molecules.nom),
      statut = excluded.statut,
      profil = coalesce(excluded.profil, molecules.profil),
      avis = coalesce(excluded.avis, molecules.avis),
      a_noter = coalesce(excluded.a_noter, molecules.a_noter),
      updated_at = now();
  end if;
  update molecules_propositions
    set etat = case when p_accepter then 'approuvee' else 'rejetee' end,
        traite_le = now(),
        traite_par = auth.uid()
    where id = p_id;
end;
$$;

revoke execute on function public.molecule_proposition_traiter(uuid, boolean) from public, anon;
grant execute on function public.molecule_proposition_traiter(uuid, boolean) to authenticated;
