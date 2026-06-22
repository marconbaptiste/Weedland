import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';

// Scanner de QR fidélité (caméra). À la lecture, ouvre /f/<id> (ajoute un
// tampon). Robuste : message clair si la caméra est inaccessible, et toujours
// possible de fermer.
export default function ScannerFidelite({ onClose }) {
  const navigate = useNavigate();
  const [erreur, setErreur] = useState('');
  const scannerRef = useRef(null);
  const traiteRef = useRef(false);

  function fermer() {
    const s = scannerRef.current;
    if (s) {
      s.stop().then(() => s.clear()).catch(() => {});
    }
    onClose();
  }

  useEffect(() => {
    const scanner = new Html5Qrcode('lecteur-qr');
    scannerRef.current = scanner;

    const onScan = (texte) => {
      if (traiteRef.current) return;
      traiteRef.current = true;
      const m = String(texte).match(/\/f\/([^/?#\s]+)/);
      const id = m ? m[1] : String(texte).trim();
      scanner.stop().then(() => scanner.clear()).catch(() => {});
      onClose();
      navigate(`/f/${id}`);
    };

    Html5Qrcode.getCameras()
      .then((cams) => {
        if (!cams || cams.length === 0) {
          setErreur('Aucune caméra détectée sur cet appareil.');
          return undefined;
        }
        const arriere =
          cams.find((c) => /back|rear|arri|environment/i.test(c.label)) || cams[cams.length - 1];
        return scanner.start(
          arriere.id,
          { fps: 10, qrbox: { width: 230, height: 230 } },
          onScan,
          () => {},
        );
      })
      .catch(() =>
        setErreur(
          "Caméra inaccessible. Autorise la caméra dans le navigateur, ou scanne le QR avec l'appareil photo du téléphone (il ouvre la fiche directement).",
        ),
      );

    return () => {
      const s = scannerRef.current;
      if (s) {
        s.stop().then(() => s.clear()).catch(() => {});
      }
    };
  }, [navigate, onClose]);

  return (
    <div className="aide-fond" role="dialog" aria-modal="true" aria-label="Scanner QR" onClick={fermer}>
      <div className="aide-modale" onClick={(e) => e.stopPropagation()}>
        <div className="aide-tete">
          <h2>🎟️ Scanner un QR client</h2>
          <button type="button" className="btn btn-discret" onClick={fermer}>
            Fermer
          </button>
        </div>
        <div id="lecteur-qr" className="lecteur-qr" />
        {erreur ? (
          <p className="message-erreur">{erreur}</p>
        ) : (
          <p className="statut">Place le QR du client dans le cadre.</p>
        )}
        <button type="button" className="btn" onClick={fermer}>
          Annuler
        </button>
      </div>
    </div>
  );
}
