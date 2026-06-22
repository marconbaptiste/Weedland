// Rendu de monnaie : décomposition d'un montant en billets et pièces (euros).
// Calcul en centimes (entiers) pour éviter les erreurs de virgule flottante.

// Coupures en euros, de la plus grande à la plus petite (billets puis pièces).
export const COUPURES = [500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];

/**
 * Décompose un montant (en euros) en coupures.
 * @returns {{valeur:number, nombre:number}[]} liste des coupures à rendre.
 */
export function decomposer(montantEuros) {
  let reste = Math.round((Number(montantEuros) || 0) * 100); // centimes
  const sortie = [];
  for (const c of COUPURES) {
    const cc = Math.round(c * 100);
    const nombre = Math.floor(reste / cc);
    if (nombre > 0) {
      sortie.push({ valeur: c, nombre });
      reste -= nombre * cc;
    }
  }
  return sortie;
}
