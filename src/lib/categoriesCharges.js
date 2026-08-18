// Catégories de charges — plan comptable simplifié d'un commerce de détail.
// `tva` = true si la TVA est en général récupérable sur cette catégorie :
// utilisé par l'ESTIMATION de TVA de la Comptabilité (indicatif uniquement —
// salaires, assurances, frais bancaires, impôts et loyer nu sont hors TVA).
export const CATEGORIES_CHARGES = [
  { id: 'loyer', libelle: '🏠 Loyer & local', tva: false },
  { id: 'salaires', libelle: '👥 Salaires & cotisations', tva: false },
  { id: 'energie', libelle: '⚡ Énergie & eau', tva: true },
  { id: 'assurances', libelle: '🛡️ Assurances', tva: false },
  { id: 'abonnements', libelle: '📱 Abonnements & logiciels', tva: true },
  { id: 'banque', libelle: '🏦 Banque & frais financiers', tva: false },
  { id: 'marketing', libelle: '📣 Marketing & publicité', tva: true },
  { id: 'fournitures', libelle: '🧰 Entretien & fournitures', tva: true },
  { id: 'transport', libelle: '🚚 Transport & livraison', tva: true },
  { id: 'impots', libelle: '🧾 Impôts & taxes', tva: false },
  { id: 'autre', libelle: '📦 Autre', tva: true },
];

export const libelleCategorie = (id) =>
  CATEGORIES_CHARGES.find((c) => c.id === id)?.libelle ?? '📦 Autre';

export const tvaRecuperable = (id) => CATEGORIES_CHARGES.find((c) => c.id === id)?.tva ?? true;
