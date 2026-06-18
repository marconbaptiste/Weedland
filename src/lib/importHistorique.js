// Analyse d'un export de tableur (un CSV par tableau) et dispatch automatique
// vers caisse / charges / fournisseurs. Fonctions pures (testées).
import { parseCSV, cleEntete } from './csv';
import { normaliserDateISO, moisFrancaisVersISO } from './dates';
import { parseMontant } from './format';

/** Classe un fichier d'après sa 1re ligne non vide : caisse / charges / fournisseurs / ignore. */
export function classifier(rows) {
  const premiere = (rows.find((r) => r.some((c) => (c ?? '').trim() !== '')) || []).map(cleEntete);
  if (premiere.includes('date') && (premiere.includes('ca') || premiere.includes('ventes'))) {
    return 'caisse';
  }
  const c0 = premiere[0] || '';
  if (c0.startsWith('charge')) return 'charges';
  if (c0.startsWith('fournisseur')) return 'fournisseurs';
  return 'ignore';
}

// Lignes de total/synthèse à exclure des dépenses (« Dépenses totales »,
// « Revenus totaux »). On garde les vraies lignes comme « Total énergie » ou
// « Tout cumulé ».
const estTotal = (libelle) => /totales|totaux/i.test(libelle);

function parseCaisse(rows) {
  const entetes = rows[0].map(cleEntete);
  const idx = (noms) => entetes.findIndex((e) => noms.includes(e));
  const iDate = idx(['date']);
  const iCA = idx(['ca', 'ventes', 'ventes_directes']);
  const iCB = idx(['cb']);
  const iMoro = idx(['moro', 'especes', 'espèces']);
  const out = [];
  for (let r = 1; r < rows.length; r += 1) {
    const ligne = rows[r];
    const date = normaliserDateISO(ligne[iDate] ?? '');
    if (!date) continue; // ignore « Revenus totaux », lignes vides…
    out.push({
      date,
      ventes_directes: parseMontant(ligne[iCA] ?? '0'),
      cb: iCB >= 0 ? parseMontant(ligne[iCB] ?? '0') : 0,
      especes: iMoro >= 0 ? parseMontant(ligne[iMoro] ?? '0') : 0,
    });
  }
  return out;
}

function parseDepenses(rows, mois) {
  const out = [];
  for (let r = 1; r < rows.length; r += 1) {
    const libelle = (rows[r][0] ?? '').trim();
    const brutMontant = rows[r][1] ?? '';
    if (!libelle || estTotal(libelle)) continue;
    if (String(brutMontant).trim() === '') continue;
    out.push({ mois, libelle, montant: parseMontant(brutMontant) });
  }
  return out;
}

/**
 * Analyse une liste de fichiers { nom, texte } et renvoie le dispatch.
 * @returns {{caisse:Array, charges:Array, fournisseurs:Array, ignores:string[]}}
 */
export function analyserFichiers(fichiers) {
  const res = { caisse: [], charges: [], fournisseurs: [], ignores: [] };
  for (const { nom, texte } of fichiers) {
    const rows = parseCSV(texte);
    if (rows.length === 0) {
      res.ignores.push(nom);
      continue;
    }
    const type = classifier(rows);
    const mois = moisFrancaisVersISO(nom);
    if (type === 'caisse') {
      res.caisse.push(...parseCaisse(rows));
    } else if (type === 'charges' && mois) {
      res.charges.push(...parseDepenses(rows, mois));
    } else if (type === 'fournisseurs' && mois) {
      res.fournisseurs.push(...parseDepenses(rows, mois));
    } else {
      res.ignores.push(nom);
    }
  }
  return res;
}
