import { useEffect, useState } from 'react';
import { genererQR, urlInscription } from '../lib/qr';

// Affiche en grand le QR d'INSCRIPTION du magasin (à afficher/imprimer au
// comptoir). Le client le scanne pour créer lui-même sa carte de fidélité.
export default function ModaleQRInscription({ magasinId, onClose, estAdmin, ouvert, onToggle }) {
  const [src, setSrc] = useState('');
  const url = urlInscription(magasinId);

  useEffect(() => {
    let actif = true;
    genererQR(url, 320).then((d) => {
      if (actif) setSrc(d);
    });
    return () => {
      actif = false;
    };
  }, [url]);

  return (
    <div
      className="aide-fond"
      role="dialog"
      aria-modal="true"
      aria-label="QR d'inscription"
      style={{ zIndex: 200 }}
      onClick={onClose}
    >
      <div className="aide-modale" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <div className="aide-tete">
          <h2>📲 Carte de fidélité — inscription</h2>
          <button type="button" className="btn btn-discret" onClick={onClose}>
            Fermer
          </button>
        </div>
        <p className="statut">
          Affiche ou imprime ce QR au comptoir : le client le scanne, crée sa carte en quelques
          secondes et repart avec <strong>1 étoile offerte</strong>.
        </p>
        {!ouvert && (
          <p className="message-erreur">
            ⚠️ Les inscriptions sont <strong>fermées</strong> : le QR ne crée plus de carte tant que
            tu ne les rouvres pas.
          </p>
        )}
        {src && <img src={src} alt="QR d'inscription" width={320} height={320} className="qr-client" />}
        <p className="statut" style={{ wordBreak: 'break-all' }}>{url}</p>
        <div className="form-inline" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn" onClick={() => window.print()}>
            Imprimer
          </button>
          {estAdmin && (
            <button type="button" className="btn" onClick={() => onToggle(!ouvert)}>
              {ouvert ? 'Fermer les inscriptions' : 'Rouvrir les inscriptions'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
