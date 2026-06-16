// Exports du récap : CSV (compatible Excel) et PDF.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatEuros } from './format';

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
 * @param {string[]} [contenu.entetes]
 * @param {Array<Array<string|number>>} [contenu.lignes]
 * @param {Array<{titre?:string, entetes:string[], lignes:Array<Array>}>} [contenu.sections]
 *        Plusieurs tableaux successifs (sinon on utilise entetes/lignes).
 */
export function telechargerPDF(nomFichier, { titre, sousTitre, resume = [], entetes, lignes, sections }) {
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

  const tableaux = sections ?? (entetes ? [{ entetes, lignes }] : []);
  tableaux.forEach((s) => {
    if (s.titre) {
      doc.setFontSize(11);
      doc.text(assainir(s.titre), 14, y + 1);
      y += 6;
    }
    autoTable(doc, {
      startY: y,
      head: [s.entetes.map(assainir)],
      body: (s.lignes ?? []).map((ligne) => ligne.map(assainir)),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [63, 174, 107] },
    });
    y = doc.lastAutoTable.finalY + 6;
  });

  doc.save(nomFichier);
}

/**
 * Génère et télécharge un bulletin de paie au format PDF (mise en page pro).
 * @param {string} nomFichier
 * @param {object} b
 * @param {object} b.employeur   { raison_sociale, adresse, siret, code_ape, convention }
 * @param {object} b.salarie     { nom, emploi, statut, num_secu, date_entree }
 * @param {string} b.periodeLabel
 * @param {string} [b.datePaiement]
 * @param {Array<{libelle:string, montant:number}>} b.gains
 * @param {Array<{libelle:string, base:number, taux_sal:number, montant_sal:number, taux_pat:number, montant_pat:number}>} b.cotisations
 * @param {object} b.totaux      { brut, totalSal, totalPat, netAvantImpot, netImposable, pas, netPaye, coutEmployeur }
 * @param {number} [b.tauxPas]
 * @param {object} [b.conges]    { acquis, pris, solde }
 */
export function telechargerBulletinPaie(nomFichier, b) {
  const doc = new jsPDF();
  const M = 14;
  const euro = (v) => assainir(formatEuros(v));
  const pct = (t) => (t || t === 0 ? `${assainir(String(t))} %` : '');

  doc.setFontSize(15);
  doc.text('BULLETIN DE PAIE', M, 16);

  // Employeur (gauche)
  const emp = b.employeur || {};
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(assainir(emp.raison_sociale || 'Employeur'), M, 26);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  let yEmp = 31;
  [emp.adresse, emp.siret && `SIRET : ${emp.siret}`, emp.code_ape && `Code APE : ${emp.code_ape}`, emp.convention]
    .filter(Boolean)
    .forEach((l) => {
      doc.text(assainir(String(l)), M, yEmp);
      yEmp += 4.5;
    });

  // Période (droite)
  doc.setFontSize(10);
  doc.text(`Période : ${assainir(b.periodeLabel || '')}`, 200, 26, { align: 'right' });
  if (b.datePaiement) doc.text(`Paiement : ${assainir(b.datePaiement)}`, 200, 31, { align: 'right' });

  // Salarié
  const s = b.salarie || {};
  let y = Math.max(yEmp, 38) + 2;
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text('Salarié', M, y);
  doc.setFont(undefined, 'normal');
  y += 4.5;
  [
    s.nom && `Nom : ${s.nom}`,
    s.emploi && `Emploi : ${s.emploi}`,
    s.statut && `Statut : ${s.statut}`,
    s.num_secu && `N° SS : ${s.num_secu}`,
    s.date_entree && `Entrée : ${s.date_entree}`,
  ]
    .filter(Boolean)
    .forEach((l) => {
      doc.text(assainir(String(l)), M, y);
      y += 4.5;
    });
  y += 2;

  // Gains
  autoTable(doc, {
    startY: y,
    head: [['Rémunération (gains)', 'Montant']],
    body: (b.gains || []).map((g) => [assainir(g.libelle), euro(g.montant)]),
    foot: [['Salaire brut', euro(b.totaux.brut)]],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [63, 174, 107] },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
  });
  y = doc.lastAutoTable.finalY + 4;

  // Cotisations
  autoTable(doc, {
    startY: y,
    head: [['Cotisations', 'Base', 'Taux sal.', 'Part salarié', 'Taux pat.', 'Part employeur']],
    body: (b.cotisations || []).map((c) => [
      assainir(c.libelle),
      euro(c.base),
      pct(c.taux_sal),
      euro(c.montant_sal),
      pct(c.taux_pat),
      euro(c.montant_pat),
    ]),
    foot: [['Total cotisations', '', '', euro(b.totaux.totalSal), '', euro(b.totaux.totalPat)]],
    styles: { fontSize: 7.5 },
    headStyles: { fillColor: [63, 174, 107] },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
  });
  y = doc.lastAutoTable.finalY + 4;

  // Récapitulatif
  const t = b.totaux;
  autoTable(doc, {
    startY: y,
    theme: 'plain',
    body: [
      ['Salaire net avant impôt', euro(t.netAvantImpot)],
      ['Net imposable', euro(t.netImposable)],
      [`Prélèvement à la source${b.tauxPas ? ` (${assainir(String(b.tauxPas))} %)` : ''}`, `- ${euro(t.pas)}`],
      ['NET À PAYER', euro(t.netPaye)],
      ['Coût total employeur', euro(t.coutEmployeur)],
    ],
    styles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right', fontStyle: 'bold' } },
  });
  y = doc.lastAutoTable.finalY + 6;

  if (b.conges && (b.conges.acquis || b.conges.pris || b.conges.solde)) {
    doc.setFontSize(8);
    doc.text(
      assainir(`Congés payés — acquis : ${b.conges.acquis || 0} | pris : ${b.conges.pris || 0} | solde : ${b.conges.solde || 0}`),
      M,
      y,
    );
    y += 6;
  }

  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text(
    'Document indicatif établi sous la responsabilité de l\'employeur. À conserver sans limitation de durée.',
    M,
    y,
  );

  doc.save(nomFichier);
}
