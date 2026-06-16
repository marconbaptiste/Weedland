// Export CSV (compatible Excel) — séparateur ";" et virgule décimale FR.

/**
 * Déclenche le téléchargement d'un fichier CSV.
 * @param {string} nomFichier  ex. "recap-2026-06-16.csv"
 * @param {string[]} entetes   ligne d'en-tête
 * @param {Array<Array<string|number>>} lignes  données
 */
export function telechargerCSV(nomFichier, entetes, lignes) {
  const echappe = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const contenu = [entetes, ...lignes]
    .map((ligne) => ligne.map(echappe).join(';'))
    .join('\n');
  // BOM UTF-8 pour qu'Excel affiche correctement les accents.
  const blob = new Blob(['﻿' + contenu], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  a.click();
  URL.revokeObjectURL(url);
}
