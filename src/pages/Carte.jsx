import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { NOM } from '../lib/marque';
import QRClient from '../components/QRClient';

// Page PUBLIQUE — carte de fidélité d'un client (ouverte en scannant son QR).
// Lecture seule pour le client ; le personnel connecté peut ajouter un tampon.
export default function Carte() {
  const { clientId } = useParams();
  const { profil } = useAuth();
  const [etat, setEtat] = useState(null);
  const [msg, setMsg] = useState('');
  const [promptInstall, setPromptInstall] = useState(null);
  const [afficheAide, setAfficheAide] = useState(false);
  const [promos, setPromos] = useState([]);

  const charger = useCallback(async () => {
    const [{ data, error }, { data: prs }] = await Promise.all([
      supabase.rpc('fidelite_etat', { p_client: clientId }),
      supabase.rpc('promotions_carte', { p_client: clientId }),
    ]);
    if (error || !data || data.length === 0) {
      setEtat({ introuvable: true });
      return;
    }
    const r = data[0];
    setEtat({ surnom: r.surnom, tampons: r.tampons, palier: r.palier });
    setPromos(prs ?? []);
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

  // Capture l'événement d'installation PWA (Android/Chrome) → bouton « Ajouter à
  // l'écran d'accueil » en 1 tap. iOS ne le supporte pas : on affiche alors les
  // instructions manuelles au clic.
  useEffect(() => {
    const surPrompt = (e) => {
      e.preventDefault();
      setPromptInstall(e);
    };
    window.addEventListener('beforeinstallprompt', surPrompt);
    return () => window.removeEventListener('beforeinstallprompt', surPrompt);
  }, []);

  async function installer() {
    if (promptInstall) {
      promptInstall.prompt();
      const choix = await promptInstall.userChoice;
      if (choix?.outcome === 'accepted') setPromptInstall(null);
    } else {
      setAfficheAide(true);
    }
  }

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

  // Aide « ajouter à l'écran d'accueil », adaptée au téléphone, masquée si déjà fait.
  const ua = navigator.userAgent || '';
  const iOS = /iphone|ipad|ipod/i.test(ua);
  const android = /android/i.test(ua);
  const dejaInstalle =
    window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

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

        <div className="qr-carte">
          <QRClient clientId={clientId} taille={200} />
          <p className="statut">📲 Montre ce QR au comptoir pour cumuler tes étoiles.</p>
        </div>

        {promos.length > 0 && (
          <div className="promos-carte">
            <h2>🎉 Promotions du moment</h2>
            {promos.map((p, i) => (
              <div key={i} className="promo-carte">
                <div className="promo-carte-tete">
                  <strong>{p.titre}</strong>
                  {p.remise && <span className="badge badge-remise">{p.remise}</span>}
                </div>
                {p.produit && <span className="promo-produit">🏷️ {p.produit}</span>}
                {p.description && <p className="promo-desc">{p.description}</p>}
              </div>
            ))}
          </div>
        )}

        {profil && (
          <button type="button" className="btn btn-primary" onClick={ajouterTampon}>
            + 1 tampon (personnel)
          </button>
        )}
        {msg && <p className="statut">{msg}</p>}

        {!profil && !dejaInstalle && (
          <div className="astuce-accueil">
            <strong>📲 Garde ta carte à portée de main</strong>
            <p>Ajoute-la à l’écran d’accueil : un raccourci, un seul tap pour présenter ton QR.</p>
            <button type="button" className="btn btn-primary" onClick={installer}>
              📲 Ajouter à l’écran d’accueil
            </button>
            {afficheAide && (
              <div className="astuce-etapes">
                {iOS ? (
                  <ol>
                    <li>Touche le bouton <strong>Partager</strong> (carré avec une flèche ↑, en bas).</li>
                    <li>Choisis <strong>« Sur l’écran d’accueil »</strong>.</li>
                    <li>Valide avec <strong>« Ajouter »</strong>.</li>
                  </ol>
                ) : android ? (
                  <ol>
                    <li>Touche le menu <strong>⋮</strong> (en haut à droite).</li>
                    <li>Choisis <strong>« Ajouter à l’écran d’accueil »</strong>.</li>
                    <li>Valide.</li>
                  </ol>
                ) : (
                  <p>
                    Depuis le menu de ton navigateur, choisis « Ajouter à l’écran d’accueil » (ou
                    ajoute la page à tes favoris).
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
