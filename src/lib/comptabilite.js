// ============================================================================
// Logique comptable Weedland — CA, chromes, réconciliation de caisse.
// POINT CRITIQUE de l'application. Fonctions PURES (aucun effet de bord),
// testées dans comptabilite.test.js.
//
// Règles métier :
//   CA du jour      = ventes_directes + Σ avances − Σ remboursements + Σ autres
//   Encaissements   = CB + espèces + autres  (argent réellement entré)
//   Solde client    = Σ avances − Σ remboursements  ('autre' exclu)
//   Réconciliation  = (CB + espèces) doit égaler (ventes_directes + remboursements du jour)
//
// Pourquoi CA ≠ Encaissements : une AVANCE (chrome) compte dans le CA mais
// n'entre PAS en caisse (crédit accordé au client). Un REMBOURSEMENT entre en
// caisse mais a déjà été déduit du CA le jour où il est saisi. Un « AUTRE »
// (achat réglé autrement : virement, chèque…) est une VENTE payée : il ajoute
// au CA ET aux encaissements (comme les espèces/CB), sans créer de dette (donc
// sans toucher le solde client).
//
// Tous les calculs se font en CENTIMES (entiers) pour éviter les erreurs de
// virgule flottante (ex. 0,1 + 0,2 !== 0,3 en flottant binaire).
// ============================================================================

/** Convertit un montant en euros (number) vers des centimes entiers. */
export function enCentimes(euros) {
  return Math.round((Number(euros) || 0) * 100);
}

/** Convertit des centimes entiers vers un montant en euros (number). */
export function enEuros(centimes) {
  return centimes / 100;
}

/** Additionne une liste de montants en euros sans erreur de flottant. */
export function somme(montants) {
  return enEuros(montants.reduce((acc, m) => acc + enCentimes(m), 0));
}

/**
 * Total des avances d'une liste de lignes de chromes.
 * @param {Array<{type:string, montant:number}>} lignes
 */
export function totalAvances(lignes) {
  return somme(lignes.filter((l) => l.type === 'avance').map((l) => l.montant));
}

/** Total des remboursements d'une liste de lignes de chromes. */
export function totalRemboursements(lignes) {
  return somme(lignes.filter((l) => l.type === 'remboursement').map((l) => l.montant));
}

/**
 * Total des « autres » (achats réglés autrement : virement, chèque…) d'une
 * liste de chromes. Un « autre » est une VENTE payée : il entre dans le CA et
 * les encaissements, mais n'affecte pas le solde (dette) du client.
 */
export function totalAutres(lignes) {
  return somme(lignes.filter((l) => l.type === 'autre').map((l) => l.montant));
}

/**
 * Solde dû d'un client = Σ avances − Σ remboursements.
 * > 0 : le client doit de l'argent. 0 : soldé.
 */
export function soldeClient(lignes) {
  return enEuros(enCentimes(totalAvances(lignes)) - enCentimes(totalRemboursements(lignes)));
}

/** Statut lisible d'un solde client. */
export function statutSolde(solde) {
  return enCentimes(solde) > 0 ? 'Dette en cours' : 'Soldé';
}

/**
 * CA du jour = ventes_directes + avances − remboursements + autres.
 * Un « autre » (virement, chèque…) est une vente payée → il ajoute au CA.
 * @param {{ventesDirectes:number, avances:number, remboursements:number, autres:number}} p
 */
export function caJour({ ventesDirectes = 0, avances = 0, remboursements = 0, autres = 0 }) {
  return enEuros(
    enCentimes(ventesDirectes) + enCentimes(avances) - enCentimes(remboursements) + enCentimes(autres),
  );
}

/** Encaissements du jour = CB + espèces + autres (argent réellement entré). */
export function encaissements({ cb = 0, especes = 0, autres = 0 }) {
  return enEuros(enCentimes(cb) + enCentimes(especes) + enCentimes(autres));
}

/**
 * Intéressement = (CA ÷ nbPersonnes) × pourcentage / 100, arrondi au centime.
 * Pour une journée partagée à parts égales, nbPersonnes > 1 divise la base.
 * @param {number} ca          CA du jour (euros)
 * @param {number} pourcentage taux d'intéressement (ex. 5 pour 5 %)
 * @param {number} nbPersonnes nombre de personnes se partageant la journée (défaut 1)
 */
export function interessement(ca, pourcentage, nbPersonnes = 1) {
  const taux = Number(pourcentage) || 0;
  const n = Math.max(1, Number(nbPersonnes) || 1);
  return enEuros(Math.round((enCentimes(ca) * taux) / 100 / n));
}

/**
 * Contrôle de cohérence de la caisse.
 * L'argent réellement entré (CB + espèces) doit égaler ce qui est attendu
 * (ventes_directes + remboursements du jour).
 * @returns {{reel:number, attendu:number, ecart:number, coherent:boolean}}
 */
export function reconciliation({ cb = 0, especes = 0, ventesDirectes = 0, remboursements = 0, autres = 0 }) {
  const reelC = enCentimes(cb) + enCentimes(especes) + enCentimes(autres);
  const attenduC = enCentimes(ventesDirectes) + enCentimes(remboursements) + enCentimes(autres);
  const ecartC = reelC - attenduC;
  return {
    reel: enEuros(reelC),
    attendu: enEuros(attenduC),
    ecart: enEuros(ecartC),
    coherent: ecartC === 0,
  };
}

/**
 * Résumé complet d'une journée à partir d'une clôture de caisse et des lignes
 * de chromes du jour. Pratique pour l'affichage temps réel du module Caisse.
 * @param {{ventes_directes:number, cb:number, especes:number, pourcentage_interessement?:number, nb_partageurs?:number}} caisse
 * @param {Array<{type:string, montant:number}>} lignesChromes
 */
export function resumeJour(caisse, lignesChromes = []) {
  const avances = totalAvances(lignesChromes);
  const remboursements = totalRemboursements(lignesChromes);
  const autres = totalAutres(lignesChromes);
  const ventesDirectes = Number(caisse.ventes_directes) || 0;
  const cb = Number(caisse.cb) || 0;
  const especes = Number(caisse.especes) || 0;
  const ca = caJour({ ventesDirectes, avances, remboursements, autres });
  return {
    avances,
    remboursements,
    autres,
    ca,
    encaissements: encaissements({ cb, especes, autres }),
    reconciliation: reconciliation({ cb, especes, ventesDirectes, remboursements, autres }),
    interessement: interessement(ca, caisse.pourcentage_interessement, caisse.nb_partageurs),
  };
}
