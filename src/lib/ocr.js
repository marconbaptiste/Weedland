// OCR de tickets/factures via Tesseract.js (chargé à la demande pour ne pas
// alourdir le bundle initial). Sert à pré-remplir le montant d'une ligne.

/**
 * Extrait un montant total d'un texte OCR (fonction pure, testable).
 * Stratégie : on privilégie les lignes contenant un mot-clé (TOTAL TTC, NET À
 * PAYER, TOTAL, MONTANT) ; à défaut, on prend le plus grand montant trouvé.
 * @param {string} texte
 * @returns {number|null}
 */
export function extraireMontant(texte) {
  if (!texte) return null;
  const montantRe = /(\d{1,4})[.,](\d{2})(?!\d)/g;
  const lire = (l) => [...l.matchAll(montantRe)].map((m) => Number(`${m[1]}.${m[2]}`));

  const lignes = texte.split(/\r?\n/);
  const motsCles = [/total\s*t\.?t\.?c/i, /net\s*[àa]\s*payer/i, /\bmontant\b/i, /\btotal\b/i];
  for (const mc of motsCles) {
    const candidats = [];
    for (const l of lignes) {
      if (mc.test(l)) candidats.push(...lire(l));
    }
    if (candidats.length) return Math.max(...candidats);
  }

  const tous = lire(texte);
  return tous.length ? Math.max(...tous) : null;
}

/**
 * Lance l'OCR sur une image (Blob/File) et renvoie le montant détecté.
 * @param {Blob|File} image
 * @returns {Promise<{montant:number|null, texte:string}>}
 */
export async function lireMontant(image) {
  const Tesseract = await import('tesseract.js');
  const { data } = await Tesseract.recognize(image, 'fra');
  return { montant: extraireMontant(data.text), texte: data.text };
}

/**
 * Lance l'OCR sur une image (Blob/File) et renvoie le texte brut.
 * @param {Blob|File} image
 * @returns {Promise<string>}
 */
export async function lireTexte(image) {
  const Tesseract = await import('tesseract.js');
  const { data } = await Tesseract.recognize(image, 'fra');
  return data.text;
}

// Lignes d'en-tête / pied de facture à ignorer (pas des produits).
const LIGNE_IGNOREE =
  /(sous[-\s]?total|total|t\.?v\.?a|\bht\b|\bttc\b|net\s*[àa]\s*payer|montant|facture|devis|date|client|adresse|siret|tva\s*intra|\btel\b|t[ée]l[ée]phone|e?-?mail|\bpage\b|r[ée]f[ée]rence|\bremise\b|acompte|iban|\bbic\b|merci|conditions)/i;

/**
 * Extrait des lignes de produits (nom + quantité + unité) d'un texte OCR de
 * facture fournisseur (fonction pure, testable). Heuristique volontairement
 * permissive : l'utilisateur valide/corrige ensuite. Renvoie un tableau de
 * { produit, quantite, unite }.
 * @param {string} texte
 * @returns {{produit:string, quantite:string, unite:string}[]}
 */
export function extraireLignesFacture(texte) {
  if (!texte) return [];
  const uniteRe = /(kg|g|mg|ml|cl|l|pi[eè]ces?|pcs?|unit[ée]s?|x)\b/i;
  const normUnite = (u) => {
    const b = (u || '').toLowerCase();
    if (b.startsWith('kg')) return 'kg';
    if (b === 'mg') return 'mg';
    if (b === 'g') return 'g';
    if (b === 'ml') return 'ml';
    if (b === 'cl' || b === 'l') return 'ml';
    return 'pièce';
  };

  const out = [];
  for (const brute of String(texte).split(/\r?\n/)) {
    const ligne = brute.trim();
    if (ligne.length < 3) continue;
    if (LIGNE_IGNOREE.test(ligne)) continue;
    // Il faut au moins une lettre (pour avoir un nom de produit).
    if (!/[a-zà-ÿ]{2,}/i.test(ligne)) continue;

    // Quantité : 1er nombre + unité éventuelle accolée.
    const mQte = ligne.match(/(\d+(?:[.,]\d+)?)\s*([a-zà-ÿ]{1,6})?/i);
    let quantite = '';
    let unite = 'g';
    if (mQte) {
      quantite = mQte[1].replace(',', '.');
      if (mQte[2] && uniteRe.test(mQte[2])) unite = normUnite(mQte[2]);
    }

    // Nom : on retire quantités, unités, prix et séparateurs.
    const produit = ligne
      .replace(/\d+(?:[.,]\d+)?\s*(kg|g|mg|ml|cl|l|pi[eè]ces?|pcs?|unit[ée]s?|x|€|eur)?/gi, ' ')
      .replace(/[€|*:#]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (produit.replace(/[^a-zà-ÿ]/gi, '').length < 2) continue;

    out.push({ produit, quantite, unite });
  }
  return out;
}
