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
