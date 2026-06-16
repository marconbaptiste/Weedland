// Exports du récap : CSV (compatible Excel) et PDF.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Espaces insécable (U+00A0), fine insécable (U+202F) et fine (U+2009)
// produites par Intl (fr-FR). Construites par code pour garder une source ASCII.
const ESPACES_SPECIALES = new RegExp(`[${String.fromCharCode(0x00a0, 0x202f, 0x2009)}]`, 'g');
const BOM = String.fromCharCode(0xfeff);

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
  // BOM UTF-8 en tête pour qu'Excel affiche correctement les accents.
  const blob = new Blob([BOM + contenu], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  a.click();
  URL.revokeObjectURL(url);
}

// Les polices standard de jsPDF ne gèrent pas ces espaces : on les remplace
// par une espace classique avant rendu.
const assainir = (v) => String(v ?? '').replace(ESPACES_SPECIALES, ' ');

/**
 * Génère et télécharge un PDF du récapitulatif.
 * @param {string} nomFichier  ex. "recap-2026-06-16.pdf"
 * @param {object} contenu
 * @param {string} contenu.titre
 * @param {string} [contenu.sousTitre]
 * @param {Array<[string, string]>} [contenu.resume]  paires libellé / valeur
 * @param {string[]} contenu.entetes
 * @param {Array<Array<string|number>>} contenu.lignes
 */
export function telechargerPDF(nomFichier, { titre, sousTitre, resume = [], entetes, lignes }) {
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text(assainir(titre), 14, 18);

  if (sousTitre) {
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(assainir(sousTitre), 14, 25);
    doc.setTextColor(0);
  }

  let y = sousTitre ? 32 : 26;

  if (resume.length) {
    autoTable(doc, {
      startY: y,
      theme: 'plain',
      body: resume.map(([label, valeur]) => [assainir(label), assainir(valeur)]),
      styles: { fontSize: 10 },
      columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
    });
    y = doc.lastAutoTable.finalY + 4;
  }

  autoTable(doc, {
    startY: y,
    head: [entetes.map(assainir)],
    body: lignes.map((ligne) => ligne.map(assainir)),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [63, 174, 107] },
  });

  doc.save(nomFichier);
}
