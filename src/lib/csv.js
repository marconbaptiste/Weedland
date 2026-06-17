// Lecture de fichiers CSV (séparateur ; ou , auto-détecté, gestion des
// guillemets). Utilisé par l'import de l'historique.

/** Parse un texte CSV en tableau de lignes (chaque ligne = tableau de cellules). */
export function parseCSV(texte) {
  const t = (texte ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const sansBom = t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;
  const contenu = sansBom.replace(/\n+$/, '');
  if (!contenu) return [];

  const premiere = contenu.split('\n')[0];
  const sep = premiere.split(';').length > premiere.split(',').length ? ';' : ',';

  const lignes = [];
  let ligne = [];
  let cellule = '';
  let entreGuillemets = false;

  for (let i = 0; i < contenu.length; i += 1) {
    const c = contenu[i];
    if (entreGuillemets) {
      if (c === '"') {
        if (contenu[i + 1] === '"') {
          cellule += '"';
          i += 1;
        } else {
          entreGuillemets = false;
        }
      } else {
        cellule += c;
      }
    } else if (c === '"') {
      entreGuillemets = true;
    } else if (c === sep) {
      ligne.push(cellule);
      cellule = '';
    } else if (c === '\n') {
      ligne.push(cellule);
      lignes.push(ligne);
      ligne = [];
      cellule = '';
    } else {
      cellule += c;
    }
  }
  ligne.push(cellule);
  lignes.push(ligne);
  return lignes;
}

/** Normalise un en-tête : minuscules, sans accents, espaces -> underscore. */
export function cleEntete(s) {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

/** parseCSV + transforme en objets {entete: valeur} (en-têtes normalisés). */
export function parseCSVObjets(texte) {
  const lignes = parseCSV(texte);
  if (lignes.length < 2) return [];
  const entetes = lignes[0].map(cleEntete);
  return lignes.slice(1).filter((l) => l.some((c) => c.trim() !== '')).map((l) => {
    const obj = {};
    entetes.forEach((e, i) => {
      obj[e] = (l[i] ?? '').trim();
    });
    return obj;
  });
}
