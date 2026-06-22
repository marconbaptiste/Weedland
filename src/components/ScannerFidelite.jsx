import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';

// Scanner de QR fidélité (caméra) : à la lecture, ouvre /f/<id> qui ajoute un
// tampon au client.
export default function ScannerFidelite({ onClose }) {
  const navigate = useNavigate();
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    const scanner = new Html5Qrcode('lecteur-qr');
    let traite = false;

    const onScan = (texte) => {
      if (traite) return;
      traite = true;
      const m = String(texte).match(/\/f\/([^/?#\s]+)/);
      const id = m ? m[1] : String(texte).trim();
      scanner.stop().catch(() => {});
      onClose();
      navigate(`/f/${id}`);
    };

    scanner
      .start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, onScan, () => {})
      .catch(() => setErreur("Impossible d'accéder à la caméra (autorise-la dans le navigateur)."));

    return () => {
      scanner.stop().catch(() => {});
    };
  }, [navigate, onClose]);

  return (
    <div className="aide-fond" role="dialog" aria-modal="true" aria-label="Scanner QR" onClick={onClose}>
      <div className="aide-modale" onClick={(e) => e.stopPropagation()}>
        <div className="aide-tete">
          <h2>🎟️ Scanner un QR client</h2>
          <button type="button" className="btn btn-discret" onClick={onClose}>
            Fermer
          </button>
        </div>
        <div id="lecteur-qr" className="lecteur-qr" />
        {erreur ? (
          <p className="message-erreur">{erreur}</p>
        ) : (
          <p className="statut">Place le QR du client dans le cadre.</p>
        )}
      </div>
    </div>
  );
}
