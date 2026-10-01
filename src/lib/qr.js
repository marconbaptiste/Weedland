import QRCode from 'qrcode';

// URL encodée dans le QR d'un client : ouvre /carte/<id>, la carte de fidélité
// PUBLIQUE (le client voit ses tampons sans se connecter ; le personnel connecté
// peut ajouter un tampon). Le scanner intégré, lui, tamponne directement.
// Le `token` (à usage unique, rotatif) est joint en `?t=…` : c'est lui que le
// scanner consomme — un QR capturé/partagé devient caduc au scan suivant.
export function urlFidelite(clientId, token) {
  return `${window.location.origin}/carte/${clientId}${token ? `?t=${token}` : ''}`;
}

// URL encodée dans le QR d'INSCRIPTION d'un magasin : ouvre /rejoindre/<id>, la
// page publique où un visiteur crée lui-même sa carte de fidélité (surnom +
// téléphone). À afficher/imprimer au comptoir.
export function urlInscription(magasinId) {
  return `${window.location.origin}/rejoindre/${magasinId}`;
}

// Génère un data URL (PNG) du QR pour une chaîne donnée.
export function genererQR(texte, taille = 256) {
  return QRCode.toDataURL(texte, { width: taille, margin: 1 });
}
