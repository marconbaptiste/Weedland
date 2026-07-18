-- ============================================================================
-- Historique INVIOLABLE des chromes (par client) — création / modification /
-- suppression. Même principe que les mouvements de stock : journal append-only
-- alimenté AUTOMATIQUEMENT par un trigger sur `chromes`, donc toute écriture
-- (front, API directe) est tracée sans pouvoir y échapper.
--
-- Sécurité : aucune policy UPDATE/DELETE → la RLS refuse toute modification du
-- journal (immuable). Lecture réservée aux membres du magasin (cloisonné).
-- L'auteur est l'appelant réel (auth.uid()). Cloisonné par magasin_id.
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

create table if not exists public.chrome_evenements (
  id          bigint generated always as identity primary key,
  chrome_id   uuid,                              -- null après suppression du chrome
  client_id   uuid not null,
  magasin_id  uuid not null,
  employe_id  uuid references public.users(id) on delete set null, -- auth.uid() = qui a fait l'action
  action      text not null check (action in ('creation', 'modification', 'suppression')),
  type        text,                              -- avance | remboursement
  montant     numeric,
  date_chrome date,
  created_at  timestamptz not null default now()
);
create index if not exists idx_chrome_evt_client on public.chrome_evenements (client_id, created_at desc);

alter table public.chrome_evenements enable row level security;

-- Lecture : membres du magasin. PAS de policy insert/update/delete : l'écriture
-- passe uniquement par le trigger SECURITY DEFINER ci-dessous (immuable).
drop policy if exists chrome_evt_select on public.chrome_evenements;
create policy chrome_evt_select on public.chrome_evenements for select to authenticated
  using (public.est_membre() and magasin_id = public.mon_magasin());

-- Trigger : journalise chaque création / modification / suppression de chrome.
create or replace function public.chrome_journal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.chrome_evenements (chrome_id, client_id, magasin_id, employe_id, action, type, montant, date_chrome)
    values (new.id, new.client_id, new.magasin_id, auth.uid(), 'creation', new.type, new.montant, new.date);
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.chrome_evenements (chrome_id, client_id, magasin_id, employe_id, action, type, montant, date_chrome)
    values (new.id, new.client_id, new.magasin_id, auth.uid(), 'modification', new.type, new.montant, new.date);
    return new;
  else -- DELETE
    insert into public.chrome_evenements (chrome_id, client_id, magasin_id, employe_id, action, type, montant, date_chrome)
    values (old.id, old.client_id, old.magasin_id, auth.uid(), 'suppression', old.type, old.montant, old.date);
    return old;
  end if;
end; $$;

drop trigger if exists trg_chrome_journal on public.chromes;
create trigger trg_chrome_journal
  after insert or update or delete on public.chromes
  for each row execute function public.chrome_journal();
