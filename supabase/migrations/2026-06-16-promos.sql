-- ============================================================================
-- Migration — Promos / traitements de faveur par client
-- Registre partagé entre employés (comme clients/chromes).
-- ============================================================================

create table if not exists public.promos (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  description text not null,
  date        date not null,
  employe_id  uuid not null references public.users (id) on delete restrict,
  created_at  timestamptz not null default now()
);
create index if not exists idx_promos_client on public.promos (client_id);

alter table public.promos enable row level security;

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
