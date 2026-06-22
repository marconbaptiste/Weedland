import QRCode from 'qrcode';

// URL de fidélité encodée dans le QR d'un client : ouvre /f/<id> dans l'app.
// En la scannant (appareil photo natif ou scanner intégré), un employé connecté
// ajoute un tampon au client.
export function urlFidelite(clientId) {
  return `${window.location.origin}/f/${clientId}`;
}

// Génère un data URL (PNG) du QR pour une chaîne donnée.
export function genererQR(texte, taille = 256) {
  return QRCode.toDataURL(texte, { width: taille, margin: 1 });
}
