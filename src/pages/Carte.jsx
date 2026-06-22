import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { NOM } from '../lib/marque';

// Page PUBLIQUE — carte de fidélité d'un client (ouverte en scannant son QR).
// Lecture seule pour le client ; le personnel connecté peut ajouter un tampon.
export default function Carte() {
  const { clientId } = useParams();
  const { profil } = useAuth();
  const [etat, setEtat] = useState(null);
  const [msg, setMsg] = useState('');

  const charger = useCallback(async () => {
    const { data, error } = await supabase.rpc('fidelite_etat', { p_client: clientId });
    if (error || !data || data.length === 0) {
      setEtat({ introuvable: true });
      return;
    }
    const r = data[0];
    setEtat({ surnom: r.surnom, tampons: r.tampons, palier: r.palier });
  }, [clientId]);

  // Rafraîchit à l'ouverture, au retour sur l'onglet/l'écran, et régulièrement
  // tant que la carte est affichée (utile quand elle est ajoutée à l'écran
  // d'accueil : elle reflète chaque nouveau tampon).
  useEffect(() => {
    document.title = 'Ma carte de fidélité';
    charger();
    const surVisible = () => {
      if (!document.hidden) charger();
    };
    document.addEventListener('visibilitychange', surVisible);
    window.addEventListener('focus', charger);
    const intervalle = setInterval(() => {
      if (!document.hidden) charger();
    }, 15000);
    return () => {
      document.removeEventListener('visibilitychange', surVisible);
      window.removeEventListener('focus', charger);
      clearInterval(intervalle);
    };
  }, [charger]);

  async function ajouterTampon() {
    setMsg('');
    const { data: nb, error } = await supabase.rpc('fidelite_ajouter', { p_client: clientId });
    if (error) {
      setMsg('Action réservée au personnel du magasin.');
      return;
    }
    if (nb >= etat.palier) {
      await supabase.rpc('fidelite_utiliser', { p_client: clientId });
      setMsg('🎁 Récompense !');
    }
    charger();
  }

  if (!etat) {
    return (
      <div className="page-connexion">
        <p className="statut">Chargement…</p>
      </div>
    );
  }
  if (etat.introuvable) {
    return (
      <div className="page-connexion">
        <div className="card carte-connexion" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem' }}>⚠️</div>
          <p className="message-erreur">Carte introuvable.</p>
        </div>
      </div>
    );
  }

  const complet = etat.tampons >= etat.palier;
  const reste = etat.palier - etat.tampons;

  return (
    <div className="page-connexion">
      <div className="card carte-connexion" style={{ textAlign: 'center' }}>
        <span className="logo">{NOM}</span>
        <h1 className="logo-connexion">🎟️ Ma carte de fidélité</h1>
        <p className="statut">
          <strong>{etat.surnom}</strong>
        </p>
        <div className="tampons" style={{ justifyContent: 'center', fontSize: '1.9rem' }}>
          {Array.from({ length: etat.palier }).map((_, i) => (
            <span key={i} className={`tampon ${i < etat.tampons ? 'plein' : ''}`}>
              {i < etat.tampons ? '★' : '☆'}
            </span>
          ))}
        </div>
        <p className="statut">
          {complet
            ? '🎁 Carte complète — récompense disponible !'
            : `${etat.tampons}/${etat.palier} — plus que ${reste} avant ta récompense !`}
        </p>

        {profil && (
          <button type="button" className="btn btn-primary" onClick={ajouterTampon}>
            + 1 tampon (personnel)
          </button>
        )}
        {msg && <p className="statut">{msg}</p>}

        {!profil && (
          <p className="statut">
            💡 Ajoute cette carte à ton écran d’accueil pour la retrouver à chaque visite — elle se
            met à jour automatiquement. (iPhone : Partager → « Sur l’écran d’accueil ». Android :
            menu ⋮ → « Ajouter à l’écran d’accueil ».)
          </p>
        )}
      </div>
    </div>
  );
}
