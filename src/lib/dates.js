// Utilitaires de dates (heure locale, format ISO court AAAA-MM-JJ).

const sansAccent = (x) => (x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Mois français (sans accents) -> numéro sur 2 chiffres.
export const MOIS_FR = {
  janvier: '01', fevrier: '02', mars: '03', avril: '04', mai: '05', juin: '06',
  juillet: '07', aout: '08', septembre: '09', octobre: '10', novembre: '11', decembre: '12',
};

/** Convertit un libellé « Mars 2026 » (n'importe où dans la chaîne) en AAAA-MM-01. */
export function moisFrancaisVersISO(texte) {
  const t = sansAccent(texte).toLowerCase();
  const m = t.match(/(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})/);
  return m ? `${m[2]}-${MOIS_FR[m[1]]}-01` : null;
}

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

/** Premier jour du mois (AAAA-MM-01) contenant la date de référence. */
export function premierDuMois(referenceISO = aujourdhuiISO()) {
  return `${referenceISO.slice(0, 7)}-01`;
}

/** Premier jour du mois précédent, à partir d'un premier-du-mois (AAAA-MM-01). */
export function moisPrecedent(premierISO) {
  const d = new Date(`${premierISO}T00:00:00`);
  d.setMonth(d.getMonth() - 1);
  return versISO(d);
}

/** Intervalle [1er janvier, 31 décembre] de l'année d'une date AAAA-MM-JJ. */
export function intervalleAnnee(referenceISO = aujourdhuiISO()) {
  const annee = referenceISO.slice(0, 4);
  return [`${annee}-01-01`, `${annee}-12-31`];
}

/** Numéro de semaine dans le mois (1 à 5) d'après le jour du mois. */
export function semaineDuMois(dateISO) {
  return Math.ceil(Number(dateISO.slice(8, 10)) / 7);
}

/**
 * Normalise une date saisie (AAAA-MM-JJ, JJ/MM/AAAA, JJ-MM-AA, « 1 mars 2026 »…)
 * en AAAA-MM-JJ. Renvoie null si non reconnue.
 */
export function normaliserDateISO(valeur) {
  const s = (valeur ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [, j, mo, a] = m;
    if (a.length === 2) a = `20${a}`;
    return `${a}-${mo.padStart(2, '0')}-${j.padStart(2, '0')}`;
  }
  // Date en toutes lettres : « 1 mars 2026 », « 09 août 2026 »
  const f = s.match(/^(\d{1,2})\s+([^\s\d]+)\s+(\d{4})$/);
  if (f) {
    const mois = MOIS_FR[sansAccent(f[2]).toLowerCase()];
    if (mois) return `${f[3]}-${mois}-${f[1].padStart(2, '0')}`;
  }
  return null;
}

/** Normalise un mois (AAAA-MM, MM/AAAA, ou une date) en 1er du mois AAAA-MM-01. */
export function normaliserMoisISO(valeur) {
  const s = (valeur ?? '').trim();
  if (/^\d{4}-\d{2}/.test(s)) return `${s.slice(0, 7)}-01`;
  const m = s.match(/^(\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [, mo, a] = m;
    if (a.length === 2) a = `20${a}`;
    return `${a}-${mo.padStart(2, '0')}-01`;
  }
  const d = normaliserDateISO(s);
  return d ? `${d.slice(0, 7)}-01` : null;
}
