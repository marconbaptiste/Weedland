// Grille tarifaire Kanabiz — HT / mois / magasin. SOURCE UNIQUE côté front
// (GestionOptions, Landing). La même table est répliquée dans l'Edge Function
// `stripe-options` (Deno) pour le calcul de la remise pack : garder les deux
// strictement cohérentes (comme comptabilite.js ↔ v_ca_jour).

export const SOCLE = 29; // offre de base « Comptoir »

export const OPTIONS_TARIFS = [
  {
    cle: 'stock',
    col: 'opt_stock',
    nom: '📦 Stocks & achats',
    detail: 'Inventaire, alertes de réappro, liste de courses, import de facture par photo',
    prix: 10,
  },
  {
    cle: 'fidelite',
    col: 'opt_fidelite',
    nom: '🎟️ Fidélité & promos',
    detail: 'Carte à tampons QR anti-triche, promotions publiques, notifications',
    prix: 12,
  },
  {
    cle: 'livraisons',
    col: 'opt_livraisons',
    nom: '🚚 Commandes & livraisons',
    detail: 'Bons de commande, adresses de livraison, suivi du jour sur l’accueil',
    prix: 8,
  },
  {
    cle: 'planning',
    col: 'opt_planning',
    nom: '📅 Planning & horaires',
    detail: 'Plannings d’équipe, horaires fixes, remplissage automatique',
    prix: 8,
  },
  {
    cle: 'compta',
    col: 'opt_compta',
    nom: '📊 Compta Pro',
    detail: 'Catégories de charges, TVA estimée, compte de résultat, trésorerie, résultat par mois',
    prix: 12,
  },
  {
    cle: 'news',
    col: 'opt_news',
    nom: '📰 News IA',
    detail: 'Veille molécules / produits / fournisseurs ciblée sur TA boutique (recherche web IA)',
    prix: 9,
  },
];

// Packs = plafonds de facturation appliqués AUTOMATIQUEMENT dès que toutes les
// options du pack sont actives (les options hors pack s'ajoutent au prix du
// pack). Ordonnés du plus complet au plus simple : c'est le PREMIER pack
// applicable qui s'applique (le plus complet prime — Premium 69 € couvre tout,
// on ne « compose » pas Pro + News à la carte en dessous de son prix affiché).
export const PACKS = [
  {
    cle: 'premium',
    nom: 'Premium',
    options: ['stock', 'fidelite', 'livraisons', 'planning', 'compta', 'news'],
    prix: 69,
  },
  {
    cle: 'pro',
    nom: 'Pro',
    options: ['stock', 'fidelite', 'livraisons', 'planning', 'compta'],
    prix: 59,
  },
  { cle: 'boutique', nom: 'Boutique', options: ['stock', 'fidelite'], prix: 45 },
];

const prixOption = (cle) => OPTIONS_TARIFS.find((o) => o.cle === cle)?.prix ?? 0;

/**
 * Calcule le tarif mensuel pour un ensemble d'options actives.
 * @param {string[]} actives — clés d'options actives (ex. ['stock','fidelite'])
 * @returns {{ plein:number, total:number, pack:object|null, remise:number }}
 *  plein = socle + somme des options ; total = meilleur prix (pack appliqué) ;
 *  pack = le pack retenu (null si aucun) ; remise = plein − total.
 */
export function calculerMensuel(actives = []) {
  const set = new Set(actives);
  const plein = SOCLE + [...set].reduce((s, cle) => s + prixOption(cle), 0);
  let total = plein;
  let pack = null;
  for (const p of PACKS) {
    if (!p.options.every((cle) => set.has(cle))) continue; // pack incomplet
    const horsPack = [...set].filter((cle) => !p.options.includes(cle));
    const candidat = p.prix + horsPack.reduce((s, cle) => s + prixOption(cle), 0);
    if (candidat < plein) {
      total = candidat;
      pack = p;
    }
    break; // premier pack applicable = le plus complet
  }
  return { plein, total, pack, remise: plein - total };
}
