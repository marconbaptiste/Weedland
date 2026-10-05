-- Veille réglementaire CBD (bulletin automatique) — DONNÉE GLOBALE, partagée par
-- tous les magasins : la législation française/UE est la même pour tout le monde,
-- il n'y a donc AUCUNE donnée par magasin ici (exception assumée à la règle
-- « magasin_id partout » : pas de tenant, donc pas de fuite inter-magasins).
--
-- Sécurité :
--   - Lecture réservée aux MEMBRES connectés (est_membre()) — jamais l'anon.
--   - Écriture : UNIQUEMENT le service_role (Edge Function veille-cbd) ; aucune
--     policy d'écriture pour authenticated → un employé/admin ne peut pas publier
--     de fausse veille. Le contenu est purement informatif (bandeau « indicatif »).

create table if not exists public.veille (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  titre text,
  intro text,
  items jsonb not null default '[]'::jsonb,   -- [{categorie, texte, source_nom, source_url}]
  source text not null default 'auto'          -- 'auto' (cron) | 'manuel' (admin)
);

alter table public.veille enable row level security;

drop policy if exists veille_lecture on public.veille;
create policy veille_lecture on public.veille
  for select to authenticated
  using (public.est_membre());

grant select on public.veille to authenticated;

-- Index pour récupérer le dernier bulletin rapidement.
create index if not exists veille_created_idx on public.veille (created_at desc);
