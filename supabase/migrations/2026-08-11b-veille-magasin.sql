-- Veille optionnellement PERSONNALISÉE par magasin.
--   magasin_id NULL  = bulletin global (légal + tendances, partagé par tous, cron)
--   magasin_id défini = bulletin ciblé sur le stock de ce magasin (généré par l'admin)
-- Un magasin ne voit que le global OU le sien (jamais celui d'un autre).
alter table public.veille add column if not exists magasin_id uuid references public.magasins(id) on delete cascade;

drop policy if exists veille_lecture on public.veille;
create policy veille_lecture on public.veille
  for select to authenticated
  using (public.est_membre() and (magasin_id is null or magasin_id = public.mon_magasin()));

create index if not exists veille_magasin_idx on public.veille (magasin_id, created_at desc);
