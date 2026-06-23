import QRCode from 'qrcode';

// URL encodée dans le QR d'un client : ouvre /carte/<id>, la carte de fidélité
// PUBLIQUE (le client voit ses tampons sans se connecter ; le personnel connecté
// peut ajouter un tampon). Le scanner intégré, lui, tamponne directement.
export function urlFidelite(clientId) {
  return `${window.location.origin}/carte/${clientId}`;
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
