// Utilitaires de dates (heure locale, format ISO court AAAA-MM-JJ).

/** Date du jour en AAAA-MM-JJ (heure locale, sans décalage UTC). */
export function aujourdhuiISO() {
  return versISO(new Date());
}

/** Date -> "AAAA-MM-JJ" en heure locale. */
export function versISO(date) {
  const d = new Date(date);
  const decalage = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - decalage).toISOString().slice(0, 10);
}

/**
 * Renvoie [debut, fin] (AAAA-MM-JJ inclus) pour une période donnée.
 * @param {'jour'|'semaine'|'mois'} periode
 * @param {string} [referenceISO] date de référence (défaut : aujourd'hui)
 */
export function intervallePeriode(periode, referenceISO = aujourdhuiISO()) {
  const ref = new Date(`${referenceISO}T00:00:00`);
  if (periode === 'jour') {
    return [referenceISO, referenceISO];
  }
  if (periode === 'semaine') {
    const jour = (ref.getDay() + 6) % 7; // lundi = 0
    const debut = new Date(ref);
    debut.setDate(ref.getDate() - jour);
    const fin = new Date(debut);
    fin.setDate(debut.getDate() + 6);
    return [versISO(debut), versISO(fin)];
  }
  // mois
  const debut = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const fin = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return [versISO(debut), versISO(fin)];
}
