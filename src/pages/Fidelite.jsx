import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

// Page ouverte en scannant le QR d'un client : ajoute un tampon, et déclenche
// la récompense (reset) quand le palier est atteint.
const appelsEnCours = new Map(); // clientId → promesse de l'appel fidelite_ajouter

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

      // Garde anti-double tampon : un F5 ou un « retour » sur cette page ne doit
      // pas créditer une 2ᵉ étoile (la page tamponne au montage). L'appel en
      // cours est mémorisé au niveau du module pour que deux montages rapprochés
      // (StrictMode, remontage) partagent le MÊME appel au lieu d'en refaire un.
      const cle = `f:${clientId}`;
      let appel = appelsEnCours.get(clientId);
      if (!appel) {
        const dernier = Number(sessionStorage.getItem(cle) || 0);
        if (Date.now() - dernier < 120000) {
          if (actif) setEtat({ chargement: false, erreur: 'Tampon déjà ajouté il y a moins de 2 minutes.' });
          return;
        }
        sessionStorage.setItem(cle, String(Date.now()));
        appel = supabase.rpc('fidelite_ajouter', { p_client: clientId });
        appelsEnCours.set(clientId, appel);
        appel.then(() => setTimeout(() => appelsEnCours.delete(clientId), 5000));
      }
      const { data: nb, error } = await appel;
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
