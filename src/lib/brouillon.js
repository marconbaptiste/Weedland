// Brouillons de formulaires conservés le temps de la session du navigateur
// (sessionStorage) : permet de changer d'onglet sans perdre une saisie en cours.
// Effacés à la fermeture de l'onglet.

export function lireBrouillon(cle) {
  try {
    const s = sessionStorage.getItem(cle);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function ecrireBrouillon(cle, valeur) {
  try {
    sessionStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    /* quota dépassé ou navigation privée : on ignore */
  }
}

export function effacerBrouillon(cle) {
  try {
    sessionStorage.removeItem(cle);
  } catch {
    /* ignore */
  }
}
