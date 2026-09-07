// URL publique du logo d'un magasin (bucket Storage public `logos`).
// `chemin` = valeur stockée dans magasins.logo (ex. « <magasin_id>/<uuid>.png »).
export function urlLogo(chemin) {
  if (!chemin) return null;
  const base = import.meta.env.VITE_SUPABASE_URL;
  return `${base}/storage/v1/object/public/logos/${chemin}`;
}
