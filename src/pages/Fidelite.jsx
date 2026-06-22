import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

// Page ouverte en scannant le QR d'un client : ajoute un tampon, et déclenche
// la récompense (reset) quand le palier est atteint.
export default function Fidelite() {
  const { clientId } = useParams();
  const { magasinId } = useAuth();
  const [etat, setEtat] = useState({ chargement: true });

  useEffect(() => {
    let actif = true;
    (async () => {
      const { data: mag } = await supabase
        .from('magasins')
        .select('fidelite_palier')
        .eq('id', magasinId)
        .single();
      const palier = mag?.fidelite_palier ?? 10;

      const { data: nb, error } = await supabase.rpc('fidelite_ajouter', { p_client: clientId });
      if (error) {
        if (actif) setEtat({ chargement: false, erreur: error.message || 'QR invalide.' });
        return;
      }
      const { data: cli } = await supabase.from('clients').select('surnom').eq('id', clientId).single();

      let recompense = false;
      let tampons = nb;
      if (nb >= palier) {
        await supabase.rpc('fidelite_utiliser', { p_client: clientId });
        recompense = true;
        tampons = 0;
      }
      if (actif) setEtat({ chargement: false, surnom: cli?.surnom ?? 'Client', palier, tampons, recompense });
    })();
    return () => {
      actif = false;
    };
  }, [clientId, magasinId]);

  return (
    <div className="page-connexion">
      <div className="card carte-connexion" style={{ textAlign: 'center' }}>
        {etat.chargement ? (
          <p className="statut">Ajout du tampon…</p>
        ) : etat.erreur ? (
          <>
            <div style={{ fontSize: '2.5rem' }}>⚠️</div>
            <p className="message-erreur">{etat.erreur}</p>
          </>
        ) : etat.recompense ? (
          <>
            <div style={{ fontSize: '3rem' }}>🎁</div>
            <h1 className="logo-connexion">Récompense !</h1>
            <p className="statut">
              Carte complète pour <strong>{etat.surnom}</strong> — offre la récompense. La carte
              repart à zéro.
            </p>
            <div className="tampons" style={{ justifyContent: 'center' }}>
              {Array.from({ length: etat.palier }).map((_, i) => (
                <span key={i} className="tampon plein">★</span>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: '3rem' }}>✅</div>
            <h1 className="logo-connexion">+1 tampon</h1>
            <p className="statut">
              <strong>{etat.surnom}</strong> : {etat.tampons}/{etat.palier} tampons.
            </p>
            <div className="tampons" style={{ justifyContent: 'center' }}>
              {Array.from({ length: etat.palier }).map((_, i) => (
                <span key={i} className={`tampon ${i < etat.tampons ? 'plein' : ''}`}>
                  {i < etat.tampons ? '★' : '☆'}
                </span>
              ))}
            </div>
          </>
        )}
        <Link to="/" className="btn btn-primary">
          Retour à l’accueil
        </Link>
      </div>
    </div>
  );
}
