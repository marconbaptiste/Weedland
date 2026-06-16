// ============================================================================
// Formatage et saisie au format français (virgule décimale, euros).
// ============================================================================

const formatteurEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

const formatteurNombre = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "1234.5" -> "1 234,50 €" */
export function formatEuros(montant) {
  return formatteurEuros.format(Number(montant) || 0);
}

/** "1234.5" -> "1 234,50" (sans symbole) */
export function formatNombre(montant) {
  return formatteurNombre.format(Number(montant) || 0);
}

/**
 * Parse une saisie utilisateur française en number.
 * Accepte "12,50", "1 234,56", "12.5", " 12 ", etc. Renvoie 0 si invalide.
 */
export function parseMontant(valeur) {
  if (typeof valeur === 'number') return valeur;
  if (valeur == null) return 0;
  const nettoye = String(valeur)
    .replace(/\s/g, '')      // espaces (y compris séparateurs de milliers)
    .replace(',', '.')        // virgule décimale française -> point
    .replace(/[^0-9.-]/g, ''); // retire le reste (€, lettres…)
  const n = Number.parseFloat(nettoye);
  return Number.isNaN(n) ? 0 : n;
}

/** Date ISO ou Date -> "16/06/2026" */
export function formatDateFr(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR').format(d);
}
