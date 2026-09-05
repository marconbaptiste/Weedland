// Lecture des clôtures de caisse postées sur WhatsApp — fonctions PURES (testées).
//
// Les équipes ont l'habitude de poster leur clôture dans un groupe WhatsApp sous
// une forme libre mais régulière :
//
//   04/09
//   CA 4046,20
//   CB 3213,7
//   Moro 692,5
//   Chromes
//   Gaétan +33
//   Adam +3
//   Livraisons
//   +52 Chessy  (Moro)
//   +52 pote Brahim
//   Caisse départ
//   100
//
// Deux usages :
//  - `parserMessageCloture(texte)` : UN message collé → pré-remplissage de la
//    clôture (Caisse) ;
//  - `extraireClotures(exportTexte)` : un EXPORT de discussion WhatsApp (.txt,
//    iOS ou Android) → toutes les clôtures trouvées, avec leur auteur (Import).
//
// Règles métier (cf. comptabilite.js) : « Moro » = espèces. Le CA annoncé dans le
// message = CB + Moro + Σ chromes + Σ livraisons. Dans l'app, les chromes sont
// saisis à part (registre `chromes`) : on ne les réimporte PAS, on s'en sert
// seulement pour contrôler le CA. Les livraisons encaissées sont ventilées : celles
// notées « (Moro) » vont dans les espèces, les autres dans « Virements / autres ».
import { parseMontant } from './format';
import { somme } from './comptabilite';

const sansAccents = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

// Ligne « libellé montant » ou « montant libellé », signé ou non.
// Ex. « CB 3213,7 », « Moro 692,5 », « CA 4046,20 ».
const LIGNE_CLE = /^([a-zA-ZÀ-ÿ' .]+?)\s*[:=]?\s*([+-]?\s*\d[\d\s]*(?:[.,]\d+)?)\s*(?:€|euros?)?\s*$/i;
// Ligne d'un chrome / d'une livraison : « Gaétan +33 », « +52 Chessy (Moro) », « Paul -20 ».
const LIGNE_SIGNEE_FIN = /^(.+?)\s+([+-])\s*(\d+(?:[.,]\d+)?)\s*(?:€|euros?)?\s*(\([^)]*\))?\s*$/;
const LIGNE_SIGNEE_DEBUT = /^([+-])\s*(\d+(?:[.,]\d+)?)\s*(?:€|euros?)?\s+(.+?)\s*$/;
// En-tête de date : « 04/09 », « 4/9/2026 », « 04-09-26 ».
const LIGNE_DATE = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?\s*$/;

const CLES = {
  ca: ['ca', 'chiffre d affaires', "chiffre d'affaires", 'total'],
  cb: ['cb', 'carte', 'cartes', 'tpe', 'carte bancaire'],
  especes: ['moro', 'especes', 'espece', 'cash', 'liquide', 'esp'],
  virements: ['virement', 'virements', 'vir'],
  fond: ['caisse depart', 'caisse de depart', 'fond de caisse', 'fond caisse', 'fond', 'caisse'],
};
const SECTIONS = {
  chromes: ['chromes', 'chrome', 'avances', 'dettes'],
  livraisons: ['livraisons', 'livraison', 'commandes', 'commande'],
};

function cleDe(libelle) {
  const l = sansAccents(libelle).replace(/[:=]/g, '').replace(/\s+/g, ' ').trim();
  for (const [cle, mots] of Object.entries(CLES)) {
    if (mots.includes(l)) return cle;
  }
  return null;
}
function sectionDe(ligne) {
  const l = sansAccents(ligne).replace(/[:\s]+$/g, '');
  for (const [sec, mots] of Object.entries(SECTIONS)) {
    if (mots.includes(l)) return sec;
  }
  return null;
}
// Mode de paiement d'une livraison, d'après la parenthèse : « (Moro) » → espèces.
function modeDe(parenthese) {
  const p = sansAccents(parenthese).replace(/[()]/g, '').trim();
  if (!p) return 'inconnu';
  if (CLES.especes.includes(p)) return 'especes';
  if (CLES.cb.includes(p)) return 'cb';
  if (CLES.virements.includes(p) || p.includes('virement') || p === 'lydia' || p === 'paypal') return 'virement';
  return 'inconnu';
}

// Date ISO à partir de « JJ/MM » (+ année facultative). Sans année : celle de la
// date d'envoi (ou d'aujourd'hui) ; si le mois est « dans le futur » par rapport à
// l'envoi (message du 2 janvier pour le 31/12), on prend l'année précédente.
export function dateDepuisEntete(jj, mm, aaaa, dateEnvoi) {
  const ref = dateEnvoi ? new Date(dateEnvoi) : new Date();
  const j = Number(jj);
  const m = Number(mm);
  if (!(j >= 1 && j <= 31 && m >= 1 && m <= 12)) return null;
  let annee = aaaa ? Number(aaaa) : ref.getFullYear();
  if (aaaa && String(aaaa).length === 2) annee += 2000;
  if (!aaaa) {
    const candidate = new Date(annee, m - 1, j);
    if (candidate.getTime() - ref.getTime() > 7 * 24 * 3600 * 1000) annee -= 1;
  }
  const d = new Date(annee, m - 1, j);
  if (d.getMonth() !== m - 1) return null; // 31/02…
  const p = (n) => String(n).padStart(2, '0');
  return `${annee}-${p(m)}-${p(j)}`;
}

/**
 * Analyse UN message de clôture. Renvoie null si le message ne ressemble pas à
 * une clôture (ni CB, ni espèces, ni CA). Montants en euros (nombres).
 */
export function parserMessageCloture(texte, { dateEnvoi } = {}) {
  const lignes = String(texte ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/[\u200e\u200f]/g, '').trim());
  const r = {
    date: null,
    ca: null,
    cb: null,
    especes: null,
    virements: null,
    fond: null,
    chromes: [],
    livraisons: [],
    avertissements: [],
  };
  let section = null;
  let attenteFond = false; // « Caisse départ » seul sur sa ligne → le montant suit
  for (const ligne of lignes) {
    if (!ligne) continue;
    if (attenteFond) {
      attenteFond = false;
      const seul = ligne.match(/^([+-]?\s*\d[\d\s]*(?:[.,]\d+)?)\s*(?:€|euros?)?$/);
      if (seul) {
        r.fond = parseMontant(seul[1]);
        continue;
      }
    }
    const md = ligne.match(LIGNE_DATE);
    if (md && r.date == null) {
      r.date = dateDepuisEntete(md[1], md[2], md[3], dateEnvoi);
      section = null;
      continue;
    }
    const sec = sectionDe(ligne);
    if (sec) {
      section = sec;
      continue;
    }
    // « Caisse départ » sans montant → montant sur la ligne suivante.
    if (cleDe(ligne) === 'fond') {
      attenteFond = true;
      section = null;
      continue;
    }
    const mc = ligne.match(LIGNE_CLE);
    const cle = mc ? cleDe(mc[1]) : null;
    if (cle) {
      const v = parseMontant(mc[2]);
      if (cle === 'fond') r.fond = v;
      else r[cle] = v;
      section = null;
      continue;
    }
    // Lignes signées (chromes / livraisons).
    let nom = null;
    let signe = null;
    let montant = null;
    let paren = '';
    const mf = ligne.match(LIGNE_SIGNEE_FIN);
    const mdbt = ligne.match(LIGNE_SIGNEE_DEBUT);
    if (mf) {
      nom = mf[1];
      signe = mf[2];
      montant = parseMontant(mf[3]);
      paren = mf[4] ?? '';
    } else if (section && mc) {
      // Dans une section, « Gaétan 33 » (sans signe) vaut « Gaétan +33 ».
      nom = mc[1];
      montant = parseMontant(mc[2]);
    } else if (mdbt) {
      signe = mdbt[1];
      montant = parseMontant(mdbt[2]);
      nom = mdbt[3];
      const mp = nom.match(/\(([^)]*)\)\s*$/);
      if (mp) {
        paren = mp[0];
        nom = nom.slice(0, mp.index).trim();
      }
    }
    if (nom != null && montant != null) {
      nom = nom.replace(/\s+/g, ' ').trim();
      if (section === 'livraisons') {
        r.livraisons.push({ nom, montant, mode: modeDe(paren) });
      } else if (section === 'chromes' || signe) {
        r.chromes.push({ nom, montant, type: signe === '-' ? 'remboursement' : 'avance' });
      }
      continue;
    }
    if (section === null && ligne.length > 2) r.avertissements.push(`Ligne non comprise : « ${ligne} »`);
  }
  if (r.cb == null && r.especes == null && r.ca == null) return null;
  return r;
}

/**
 * Propose les champs d'une clôture de l'app à partir d'un message analysé.
 * - espèces = Moro + livraisons payées en espèces ;
 * - virements = virements annoncés + livraisons hors espèces (virement, inconnu) ;
 * - CB = CB annoncée + livraisons notées (CB).
 * Le CA recalculé (CB + espèces + virements + avances − remboursements) est
 * comparé au CA annoncé : `ecart` ≠ 0 → à vérifier avant d'enregistrer.
 */
export function proposerCloture(msg) {
  if (!msg) return null;
  const livr = (mode) => somme(msg.livraisons.filter((l) => l.mode === mode).map((l) => l.montant));
  const cb = somme([msg.cb ?? 0, livr('cb')]);
  const especes = somme([msg.especes ?? 0, livr('especes')]);
  const virements = somme([msg.virements ?? 0, livr('virement'), livr('inconnu')]);
  const avances = somme(msg.chromes.filter((c) => c.type === 'avance').map((c) => c.montant));
  const remboursements = somme(msg.chromes.filter((c) => c.type === 'remboursement').map((c) => c.montant));
  const caCalcule = somme([cb, especes, virements, avances, -remboursements]);
  const ecart = msg.ca == null ? 0 : somme([msg.ca, -caCalcule]);
  const detailLivr = msg.livraisons
    .map((l) => `+${String(l.montant).replace('.', ',')} ${l.nom}${l.mode === 'especes' ? ' (espèces)' : ''}`)
    .join(', ');
  return {
    date: msg.date,
    cb,
    especes,
    virements,
    fond_caisse: msg.fond ?? 0,
    commentaire: detailLivr ? `Livraisons : ${detailLivr}` : '',
    caAnnonce: msg.ca,
    caCalcule,
    ecart,
    chromesMessage: somme([avances, -remboursements]),
    nbChromes: msg.chromes.length,
    nbLivraisons: msg.livraisons.length,
  };
}

// Ligne d'en-tête d'un message dans un export WhatsApp :
//  iOS      : « [04/09/2026 21:17:33] Adam: … » (souvent précédé d'un U+200E)
//  Android  : « 04/09/2026, 21:17 - Adam: … » / « 04/09/2026 à 21:17 - Adam: … »
const ENTETE_EXPORT =
  /^\[?(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(?:à\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:[APap][Mm])?\]?\s*(?:-\s*)?([^:]{1,60}?):\s?(.*)$/;

/** Découpe un export de discussion WhatsApp en messages { auteur, envoye, texte }. */
export function parserExportWhatsapp(texte) {
  const messages = [];
  let courant = null;
  for (const brute of String(texte ?? '').split(/\r?\n/)) {
    const ligne = brute.replace(/[\u200e\u200f]/g, '');
    const m = ligne.match(ENTETE_EXPORT);
    if (m) {
      const [, jj, mm, aa, hh, mi] = m;
      let annee = Number(aa);
      if (aa.length === 2) annee += 2000;
      const envoye = new Date(annee, Number(mm) - 1, Number(jj), Number(hh), Number(mi));
      courant = { auteur: m[7].trim(), envoye, texte: m[8] };
      messages.push(courant);
    } else if (courant) {
      courant.texte += '\n' + ligne;
    }
  }
  return messages;
}

/**
 * Toutes les clôtures d'un export WhatsApp : { auteur, envoye, message, cloture }.
 * Si un même auteur a posté plusieurs fois pour la même date (message corrigé),
 * on garde le DERNIER. Triées par date de clôture.
 */
export function extraireClotures(texte) {
  const parAuteurDate = new Map();
  for (const m of parserExportWhatsapp(texte)) {
    const msg = parserMessageCloture(m.texte, { dateEnvoi: m.envoye });
    if (!msg || !msg.date) continue;
    parAuteurDate.set(`${sansAccents(m.auteur)}|${msg.date}`, {
      auteur: m.auteur,
      envoye: m.envoye,
      message: msg,
      cloture: proposerCloture(msg),
    });
  }
  return [...parAuteurDate.values()].sort((a, b) => a.message.date.localeCompare(b.message.date));
}

/** Rapproche un auteur WhatsApp d'un employé de l'app (prénom, insensible aux accents). */
export function trouverEmploye(auteur, employes) {
  const a = sansAccents(auteur);
  if (!a) return null;
  const exact = employes.find((e) => sansAccents(e.nom) === a);
  if (exact) return exact;
  const motsA = a.split(/\s+/);
  return (
    employes.find((e) => {
      const n = sansAccents(e.nom);
      const motsN = n.split(/\s+/);
      return motsA.some((w) => w.length >= 3 && motsN.includes(w)) || n.startsWith(a) || a.startsWith(n);
    }) ?? null
  );
}
