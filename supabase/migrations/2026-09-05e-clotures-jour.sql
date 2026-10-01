-- Migration — anti-doublon de clôture : qui a déjà clôturé ce jour-là ?
--
-- Une clôture est UNIQUE par (employe_id, date) : un même employé ne peut jamais
-- compter deux fois sa journée. Le seul doublon possible est une DEUXIÈME clôture
-- du même jour saisie par un AUTRE employé (ex. un collègue qui recopie le message
-- WhatsApp d'Adam dans sa propre clôture) — légitime seulement en journée « relais ».
-- Or un employé ne voit que ses propres lignes de `caisse_jour` (RLS) : il ne peut
-- pas savoir qu'un collègue a déjà clôturé. Cette fonction ne renvoie que les NOMS
-- des collègues du magasin ayant une clôture à cette date (aucun montant), pour
-- afficher un avertissement dans la page Clôture et dans l'import WhatsApp.
create or replace function public.clotures_jour(p_date date)
returns table (employe_id uuid, nom text)
language sql stable security definer set search_path = public as $$
  select c.employe_id, u.nom
    from public.caisse_jour c
    join public.users u on u.id = c.employe_id
   where public.est_membre()
     and c.magasin_id = public.mon_magasin()
     and c.date = p_date
   order by u.nom;
$$;
revoke execute on function public.clotures_jour(date) from public, anon;
grant execute on function public.clotures_jour(date) to authenticated;
