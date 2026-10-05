-- ============================================================================
-- Migration — Durcissement de l'inscription publique (passe de pentest).
-- ----------------------------------------------------------------------------
-- F1 (oracle « téléphone → carte ») : sur un téléphone DÉJÀ inscrit, la fonction
--   renvoyait l'UUID de la carte existante à l'appelant anonyme → un tiers
--   connaissant un numéro pouvait retrouver l'UUID « secret » de la carte, puis
--   son surnom/tampons (fidelite_etat/token). Désormais : sur conflit → NULL
--   (on ne divulgue jamais l'id d'une carte préexistante). Le front affiche
--   « déjà inscrit, retrouve ta carte au comptoir » quand la RPC renvoie NULL.
-- F2 (DoS du quota) : le compteur quotidien d'inscriptions s'incrémentait AVANT
--   le contrôle de doublon → répéter le même numéro brûlait le plafond (200/j).
--   Désormais : plafond vérifié par LECTURE, incrément UNIQUEMENT sur création
--   réelle (les doublons ne consomment plus le quota).
-- À exécuter dans l'éditeur SQL Supabase.
-- ============================================================================

create or replace function public.inscription_client_publique(p_magasin uuid, p_surnom text, p_telephone text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid; v_ouvert boolean; v_count int;
  v_surnom text := left(btrim(coalesce(p_surnom, '')), 40);
  v_tel text := btrim(coalesce(p_telephone, ''));
begin
  select inscriptions_ouvertes into v_ouvert from public.magasins where id = p_magasin;
  if v_ouvert is null then raise exception 'Magasin inconnu.'; end if;
  if not v_ouvert then raise exception 'Les inscriptions sont fermées pour ce magasin.'; end if;
  if v_surnom = '' then raise exception 'Surnom requis.'; end if;
  if v_tel = '' then raise exception 'Téléphone requis.'; end if;
  if length(public.normaliser_tel(v_tel)) < 6 then
    raise exception 'Numéro de téléphone invalide.';
  end if;

  -- Plafond quotidien anti-spam : LECTURE du compteur du jour (sans incrément).
  select case when inscriptions_jour_date = current_date then inscriptions_jour else 0 end
    into v_count
    from public.magasins where id = p_magasin;
  if v_count >= 200 then
    raise exception 'Trop d''inscriptions aujourd''hui pour ce magasin, réessayez demain.';
  end if;

  -- Création atomique (dédup par téléphone normalisé). Sur conflit : rien créé,
  -- et on NE divulgue PAS l'id de la carte existante (F1).
  insert into public.clients (surnom, telephone, magasin_id)
  values (v_surnom, v_tel, p_magasin)
  on conflict (magasin_id, public.normaliser_tel(telephone))
    where (telephone is not null and telephone <> '')
  do nothing
  returning id into v_id;

  if v_id is null then
    return null;  -- déjà inscrit : ni fuite d'UUID, ni incrément de compteur
  end if;

  -- Création effective → on compte (F2).
  update public.magasins
    set inscriptions_jour = case when inscriptions_jour_date = current_date then inscriptions_jour + 1 else 1 end,
        inscriptions_jour_date = current_date
    where id = p_magasin;

  return v_id;
end; $function$;
