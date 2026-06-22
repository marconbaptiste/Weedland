import { useEffect, useState } from 'react';
import CalculatriceMonnaie from './CalculatriceMonnaie';

// Bouton flottant (présent sur toutes les pages de l'app) ouvrant la
// calculatrice de rendu de monnaie en un clic.
export default function BoutonMonnaie() {
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    if (!ouvert) return undefined;
    const surTouche = (e) => {
      if (e.key === 'Escape') setOuvert(false);
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [ouvert]);

  return (
    <>
      <button
        type="button"
        className="fab-monnaie"
        onClick={() => setOuvert(true)}
        aria-label="Rendu de monnaie"
        title="Rendu de monnaie"
      >
        💶
      </button>

      {ouvert && (
        <div
          className="aide-fond"
          role="dialog"
          aria-modal="true"
          aria-label="Rendu de monnaie"
          onClick={() => setOuvert(false)}
        >
          <div className="aide-modale" onClick={(e) => e.stopPropagation()}>
            <div className="aide-tete">
              <h2>💶 Rendu de monnaie</h2>
              <button type="button" className="btn btn-discret" onClick={() => setOuvert(false)}>
                Fermer
              </button>
            </div>
            <CalculatriceMonnaie />
          </div>
        </div>
      )}
    </>
  );
}
