import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

// Scanner de QR fidélité (caméra). À chaque lecture : +1 tampon, puis affichage
// du résultat en étoiles pendant quelques secondes, et le scan reprend.
export default function ScannerFidelite({ onClose }) {
  const { magasinId } = useAuth();
  const [erreur, setErreur] = useState('');
  const [resultat, setResultat] = useState(null);
  const scannerRef = useRef(null);
  const palierRef = useRef(10);
  const occupeRef = useRef(false);

  async function fermer() {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) {
      try {
        await s.stop();
      } catch {
        /* déjà arrêté */
      }
      try {
        await s.clear();
      } catch {
        /* ignore */
      }
    }
    onClose();
  }

  const traiter = useCallback(async (texte) => {
    if (occupeRef.current) return;
    occupeRef.current = true;
    try {
      scannerRef.current?.pause(true);
    } catch {
      /* ignore */
    }
    const m = String(texte).match(/\/(?:carte|f)\/([^/?#\s]+)/);
    const id = m ? m[1] : String(texte).trim();
    const palier = palierRef.current;

    const { data: nb, error } = await supabase.rpc('fidelite_ajouter', { p_client: id });
    if (error) {
      setResultat({ erreur: true, message: error.message });
    } else {
      const { data: cli } = await supabase.from('clients').select('surnom').eq('id', id).single();
      let tampons = nb;
      let recompense = false;
      if (nb >= palier) {
        await supabase.rpc('fidelite_utiliser', { p_client: id });
        recompense = true;
        tampons = palier;
      }
      setResultat({ surnom: cli?.surnom ?? 'Client', tampons, palier, recompense });
    }

    setTimeout(() => {
      setResultat(null);
      occupeRef.current = false;
      try {
        scannerRef.current?.resume();
      } catch {
        /* ignore */
      }
    }, 4000);
  }, []);

  useEffect(() => {
    if (magasinId) {
      supabase
        .from('magasins')
        .select('fidelite_palier')
        .eq('id', magasinId)
        .single()
        .then(({ data }) => {
          palierRef.current = data?.fidelite_palier ?? 10;
        });
    }
    const scanner = new Html5Qrcode('lecteur-qr');
    scannerRef.current = scanner;
    Html5Qrcode.getCameras()
      .then((cams) => {
        if (!cams || cams.length === 0) {
          setErreur('Aucune caméra détectée sur cet appareil.');
          return undefined;
        }
        const arriere =
          cams.find((c) => /back|rear|arri|environment/i.test(c.label)) || cams[cams.length - 1];
        return scanner.start(arriere.id, { fps: 10, qrbox: { width: 230, height: 230 } }, traiter, () => {});
      })
      .catch(() =>
        setErreur(
          "Caméra inaccessible. Autorise la caméra, ou scanne le QR avec l'appareil photo du téléphone.",
        ),
      );
    return () => {
      const s = scannerRef.current;
      if (s) s.stop().then(() => s.clear()).catch(() => {});
    };
  }, [magasinId, traiter]);

  const etoiles = (pleins, total) =>
    Array.from({ length: total }).map((_, i) => (
      <span key={i} className={`tampon ${i < pleins ? 'plein' : ''}`}>
        {i < pleins ? '★' : '☆'}
      </span>
    ));

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

        {resultat ? (
          resultat.erreur ? (
            <p className="message-erreur">{resultat.message || 'QR invalide.'}</p>
          ) : (
            <div className={`scan-resultat ${resultat.recompense ? 'recompense' : ''}`}>
              <strong>
                {resultat.recompense
                  ? `🎁 Récompense ! ${resultat.surnom}`
                  : `+1 — ${resultat.surnom} (${resultat.tampons}/${resultat.palier})`}
              </strong>
              <div className="tampons">{etoiles(resultat.tampons, resultat.palier)}</div>
            </div>
          )
        ) : erreur ? (
          <p className="message-erreur">{erreur}</p>
        ) : (
          <p className="statut">Place le QR du client dans le cadre.</p>
        )}

        <button type="button" className="btn" onClick={fermer}>
          Fermer
        </button>
      </div>
    </div>
  );
}
