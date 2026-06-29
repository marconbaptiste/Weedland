import { useState } from 'react';
import ScannerFidelite from './ScannerFidelite';

// Bouton flottant (présent sur toutes les pages) ouvrant le scanner de carte de
// fidélité en un clic. Empilé au-dessus des bulles « courses » et « monnaie ».
export default function BoutonScanner() {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <button
        type="button"
        className="fab-scanner"
        onClick={() => setOuvert(true)}
        aria-label="Scanner fidélité"
        title="Scanner fidélité"
      >
        🎟️
      </button>

      {ouvert && <ScannerFidelite onClose={() => setOuvert(false)} />}
    </>
  );
}
