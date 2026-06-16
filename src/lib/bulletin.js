// ============================================================================
// Calcul d'un bulletin de paie (fonctions pures).
// AUCUN taux légal n'est codé en dur : les taux sont saisis par l'utilisateur.
// Tous les calculs passent par les centimes (cf. comptabilite.js).
// ============================================================================
import { enCentimes, enEuros, somme } from './comptabilite';

/** Montant d'une cotisation = base × taux / 100 (arrondi au centime). */
export function montantCotisation(base, taux) {
  return enEuros(Math.round((enCentimes(base) * (Number(taux) || 0)) / 100));
}

/**
 * Calcule l'ensemble des totaux d'un bulletin.
 * @param {object} p
 * @param {Array<{montant:number}>} p.gains          lignes de gains (brut)
 * @param {Array<{base:number, taux_sal:number, taux_pat:number}>} p.cotisations
 * @param {number} [p.netImposable]  si fourni, remplace le net imposable calculé
 * @param {number} [p.tauxPas]       taux de prélèvement à la source (%)
 */
export function calculerBulletin({ gains = [], cotisations = [], netImposable, tauxPas = 0 }) {
  const brut = somme(gains.map((g) => g.montant));

  const lignes = cotisations.map((c) => ({
    ...c,
    montant_sal: montantCotisation(c.base, c.taux_sal),
    montant_pat: montantCotisation(c.base, c.taux_pat),
  }));

  const totalSal = somme(lignes.map((c) => c.montant_sal));
  const totalPat = somme(lignes.map((c) => c.montant_pat));
  const netAvantImpot = enEuros(enCentimes(brut) - enCentimes(totalSal));
  const ni =
    netImposable === undefined || netImposable === null || netImposable === ''
      ? netAvantImpot
      : Number(netImposable);
  const pas = enEuros(Math.round((enCentimes(ni) * (Number(tauxPas) || 0)) / 100));
  const netPaye = enEuros(enCentimes(netAvantImpot) - enCentimes(pas));
  const coutEmployeur = enEuros(enCentimes(brut) + enCentimes(totalPat));

  return {
    brut,
    lignes,
    totalSal,
    totalPat,
    netAvantImpot,
    netImposable: ni,
    pas,
    netPaye,
    coutEmployeur,
  };
}

/** Rubriques de cotisations standard (libellés), taux à 0 — à compléter. */
export const COTISATIONS_STANDARD = [
  'Santé (Sécurité sociale - maladie)',
  'Complémentaire santé (mutuelle)',
  'Accidents du travail',
  'Retraite Sécurité sociale plafonnée',
  'Retraite Sécurité sociale déplafonnée',
  'Retraite complémentaire Agirc-Arrco T1',
  'Retraite complémentaire Agirc-Arrco T2',
  'Contribution équilibre général (CEG)',
  'Assurance chômage',
  'APEC (cadres)',
  'CSG déductible',
  'CSG / CRDS non déductible',
];

/** Construit un bulletin vierge prêt à remplir (gains + rubriques standard). */
export function bulletinVierge() {
  return {
    salarie: { nom: '', emploi: '', num_secu: '', date_entree: '', statut: 'Employé' },
    periode: { date_paiement: '' },
    gains: [{ libelle: 'Salaire de base', montant: '' }],
    cotisations: COTISATIONS_STANDARD.map((libelle) => ({
      libelle,
      base: '',
      taux_sal: '',
      taux_pat: '',
    })),
    net_imposable: '',
    taux_pas: '',
    conges: { acquis: '', pris: '', solde: '' },
    commentaire: '',
  };
}
