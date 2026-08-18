import { useEffect, useState } from 'react';
import { genererQR, urlFidelite } from '../lib/qr';

// Affiche le QR de fidélité d'un client (image PNG générée localement).
// Le `token` (à usage unique) est encodé dans le QR : il change à chaque
// rotation, ce qui régénère l'image — une capture devient caduque.
export default function QRClient({ clientId, token, taille = 240 }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let actif = true;
    genererQR(urlFidelite(clientId, token), taille).then((d) => {
      if (actif) setSrc(d);
    });
    return () => {
      actif = false;
    };
  }, [clientId, token, taille]);
  if (!src) return null;
  return <img src={src} alt="QR fidélité" width={taille} height={taille} className="qr-client" />;
}
