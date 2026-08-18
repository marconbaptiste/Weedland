-- ============================================================================
-- Migration — Promotions du magasin (affichées sur les cartes de fidélité).
-- ----------------------------------------------------------------------------
-- Promotions à l'échelle du MAGASIN (≠ table `promos` qui est un traitement de
-- faveur par client). L'admin les crée ; elles s'affichent sur toutes les
-- cartes de fidélité du magasin (page publique /carte/:id) tant qu'elles sont
-- actives et dans leur période de validité.
--   - texte libre (titre, description, remise) + lien produit OPTIONNEL (stocks)
--   - lecture publique via promotions_carte() (SECURITY DEFINER, anon) qui ne
--     renvoie que les champs d'affichage, cloisonnés au magasin du client.
-- À exécuter dans l'éditeur SQL Supabase (après stocks + multi-magasin).
-- ============================================================================

create table if not exists public.promotions (
  id          uuid primary key default gen_random_uuid(),
  magasin_id  uuid not null default public.mon_magasin() references public.magasins(id) on delete cascade,
  titre       text not null,
  description text,
  remise      text,                       -- libre : "-10%", "2g offerts"…
  stock_id    uuid references public.stocks(id) on delete set null, -- produit lié (optionnel)
  date_debut  date,
  date_fin    date,
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_promotions_magasin on public.promotions (magasin_id);

alter table public.promotions enable row level security;

-- Lecture par les membres du magasin (page admin). Écriture réservée à l'admin.
drop policy if exists promotions_select on public.promotions;
create policy promotions_select on public.promotions for select to authenticated
  using (magasin_id = public.mon_magasin());

drop policy if exists promotions_admin_insert on public.promotions;
create policy promotions_admin_insert on public.promotions for insert to authenticated
  with check (public.est_admin() and magasin_id = public.mon_magasin());

drop policy if exists promotions_admin_update on public.promotions;
create policy promotions_admin_update on public.promotions for update to authenticated
  using (public.est_admin() and magasin_id = public.mon_magasin())
  with check (public.est_admin() and magasin_id = public.mon_magasin());

drop policy if exists promotions_admin_delete on public.promotions;
create policy promotions_admin_delete on public.promotions for delete to authenticated
  using (public.est_admin() and magasin_id = public.mon_magasin());

-- Lecture PUBLIQUE des promotions actives d'un client (par son magasin).
-- N'expose que les champs d'affichage, jamais la structure interne.
create or replace function public.promotions_carte(p_client uuid)
returns table (titre text, description text, remise text, produit text)
language sql stable security definer set search_path = public as $$
  select p.titre, p.description, p.remise, s.nom
  from public.clients c
  join public.promotions p on p.magasin_id = c.magasin_id
  left join public.stocks s on s.id = p.stock_id
  where c.id = p_client
    and p.actif
    and (p.date_debut is null or p.date_debut <= current_date)
    and (p.date_fin is null or p.date_fin >= current_date)
  order by p.created_at desc;
$$;

grant execute on function public.promotions_carte(uuid) to anon, authenticated;
