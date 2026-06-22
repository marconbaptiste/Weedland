import QRCode from 'qrcode';

// URL encodée dans le QR d'un client : ouvre /carte/<id>, la carte de fidélité
// PUBLIQUE (le client voit ses tampons sans se connecter ; le personnel connecté
// peut ajouter un tampon). Le scanner intégré, lui, tamponne directement.
export function urlFidelite(clientId) {
  return `${window.location.origin}/carte/${clientId}`;
}

// Génère un data URL (PNG) du QR pour une chaîne donnée.
export function genererQR(texte, taille = 256) {
  return QRCode.toDataURL(texte, { width: taille, margin: 1 });
}
