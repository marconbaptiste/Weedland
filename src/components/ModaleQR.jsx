import QRClient from './QRClient';

// Affiche en grand le QR de fidélité d'un client (à photographier par le client).
export default function ModaleQR({ surnom, clientId, onClose }) {
  return (
    <div className="aide-fond" role="dialog" aria-modal="true" aria-label="QR fidélité" style={{ zIndex: 200 }} onClick={onClose}>
      <div className="aide-modale" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <div className="aide-tete">
          <h2>🎟️ Carte de fidélité — {surnom}</h2>
          <button type="button" className="btn btn-discret" onClick={onClose}>
            Fermer
          </button>
        </div>
        <p className="statut">
          Le client prend cette carte en photo : en la scannant lui-même, il verra ses tampons.
          De ton côté, scanne-la (bouton « Scanner ») pour ajouter un tampon.
        </p>
        <QRClient clientId={clientId} taille={260} />
      </div>
    </div>
  );
}
