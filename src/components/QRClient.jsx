import { useEffect, useState } from 'react';
import { genererQR, urlFidelite } from '../lib/qr';

// Affiche le QR de fidélité d'un client (image PNG générée localement).
export default function QRClient({ clientId, taille = 240 }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let actif = true;
    genererQR(urlFidelite(clientId), taille).then((d) => {
      if (actif) setSrc(d);
    });
    return () => {
      actif = false;
    };
  }, [clientId, taille]);
  if (!src) return null;
  return <img src={src} alt="QR fidélité" width={taille} height={taille} className="qr-client" />;
}
