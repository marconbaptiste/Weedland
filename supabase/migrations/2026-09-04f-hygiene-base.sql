-- Migration — Hygiène base (audit ops / advisors Supabase).
--
--  1. Les fonctions INTERNES (helpers RLS, triggers, setters admin) étaient
--     exécutables par `anon` : inutile (elles renvoient false/null sans JWT)
--     mais c'est de la surface en trop → revoke. Les fonctions publiques par
--     conception (carte de fidélité, inscription QR, infos magasin) ne sont
--     PAS touchées.
--  2. Index manquants sur des clés étrangères très sollicitées (advisor perf) :
--     ajoutés seulement si la table ET la colonne existent (installation neuve
--     ou ancienne).
-- (Reste côté Dashboard : Authentication → « Leaked password protection » ON.)

do $$
declare f text;
begin
  foreach f in array array[
    'public.est_admin()', 'public.est_membre()', 'public.est_superadmin()', 'public.mon_magasin()',
    'public.magasin_infos_set(text, text, jsonb)', 'public.magasin_logo_set(text)',
    'public.inscriptions_set(boolean)', 'public.fidelite_palier(int)',
    'public.handle_new_user()', 'public.users_garde_role()', 'public.users_garde_delete()',
    'public.users_garde_actif()', 'public.chrome_journal()', 'public.stock_journal()',
    'public.clients_garde_insert()', 'public.messages_garde_update()',
    'public.taux_interessement(uuid)', 'public.caisse_nb_interesses(uuid)',
    'public.collegues()', 'public.client_maj(uuid, text, text, text, text)'
  ] loop
    begin
      execute format('revoke execute on function %s from public, anon', f);
    exception when undefined_function or invalid_parameter_value then
      null; -- signature absente sur cette installation
    end;
  end loop;
end $$;

do $$
declare
  paires text[][] := array[
    ['users', 'magasin_id'], ['clients', 'magasin_id'], ['chromes', 'client_id'], ['chromes', 'employe_id'],
    ['chromes', 'magasin_id'], ['caisse_jour', 'magasin_id'], ['caisse_jour', 'employe_id'],
    ['commandes', 'client_id'], ['commandes', 'magasin_id'], ['commandes', 'employe_id'],
    ['stock_mouvements', 'stock_id'], ['stock_mouvements', 'employe_id'], ['stocks', 'magasin_id'],
    ['promos', 'client_id'], ['push_abonnements', 'client_id'], ['paiements_employes', 'employe_id'],
    ['fidelite_evenements', 'client_id'], ['chrome_evenements', 'chrome_id'], ['plannings', 'employe_id'],
    ['plannings', 'magasin_id'], ['liste_courses', 'magasin_id'], ['messages', 'auteur_id'],
    ['promotions', 'magasin_id'], ['charges', 'magasin_id'], ['fournisseurs', 'magasin_id']
  ];
  i int;
begin
  for i in 1 .. array_length(paires, 1) loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = paires[i][1] and column_name = paires[i][2]
    ) then
      execute format('create index if not exists idx_%s_%s on public.%I (%I)',
        paires[i][1], paires[i][2], paires[i][1], paires[i][2]);
    end if;
  end loop;
end $$;
