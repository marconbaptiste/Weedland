import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { NOM } from '../lib/marque';
import QRClient from '../components/QRClient';

// Génère l'icône de la carte de fidélité (🎟️ sur fond sombre arrondi) en PNG
// (data URI). Utilisé pour le raccourci écran d'accueil : iOS exige un PNG
// (apple-touch-icon), le SVG/manifeste ne suffit pas. Rendu côté client.
function genererIconeCarte(taille) {
  try {
    const c = document.createElement('canvas');
    c.width = taille;
    c.height = taille;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const r = Math.round(taille * 0.22);
    ctx.fillStyle = '#0f1115';
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(taille, 0, taille, taille, r);
    ctx.arcTo(taille, taille, 0, taille, r);
    ctx.arcTo(0, taille, 0, 0, r);
    ctx.arcTo(0, 0, taille, 0, r);
    ctx.closePath();
    ctx.fill();
    ctx.font = `${Math.round(taille * 0.62)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎟️', taille / 2, taille * 0.55);
    return c.toDataURL('image/png');
  } catch {
    return null;
  }
}

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
    // fidelite_token renvoie l'état + un token frais (rotatif) encodé dans le QR :
    // une capture du QR devient caduque dès le scan suivant ou la rotation (TTL).
    const [{ data, error }, { data: prs }] = await Promise.all([
      supabase.rpc('fidelite_token', { p_client: clientId, p_ttl_sec: 60 }),
      supabase.rpc('promotions_carte', { p_client: clientId }),
    ]);
    if (error || !data || data.length === 0) {
      setEtat({ introuvable: true });
      return;
    }
    const r = data[0];
    setEtat({ token: r.token, surnom: r.surnom, tampons: r.tampons, palier: r.palier, magasin: r.magasin });
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

  const magasin = etat && !etat.introuvable ? etat.magasin : null;

  // Personnalise le raccourci écran d'accueil (au lieu de « Gestion ») :
  //  - onglet : « Carte de fidélité – <magasin> »
  //  - libellé du raccourci : « <magasin> Fidélité »
  //  - icône : l'icône de la carte (🎟️) en PNG pour iOS (apple-touch-icon) et
  //    dans un manifeste PWA propre à la carte (Android).
  // Tout est restauré en quittant la page.
  useEffect(() => {
    if (!magasin) return undefined;
    const titre = `Carte de fidélité – ${magasin}`;
    const libelle = `${magasin} Fidélité`;
    const icone = genererIconeCarte(180);
    const icone512 = genererIconeCarte(512);

    const prevTitre = document.title;
    document.title = titre;

    // Libellé court (iOS) = « <magasin> Fidélité ».
    let meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    const metaCree = !meta;
    const prevMeta = meta?.getAttribute('content');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'apple-mobile-web-app-title');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', libelle);

    // Icône iOS (apple-touch-icon) = 🎟️ en PNG.
    const apple = document.querySelector('link[rel="apple-touch-icon"]');
    const prevApple = apple?.getAttribute('href');
    if (apple && icone) apple.setAttribute('href', icone);

    // Manifeste propre à la carte (Android) : nom + libellé + icône dédiés.
    const lien = document.querySelector('link[rel="manifest"]');
    const prevManifest = lien?.getAttribute('href');
    let blobUrl;
    if (lien) {
      const manifeste = {
        name: titre,
        short_name: libelle,
        start_url: window.location.pathname,
        scope: window.location.pathname,
        display: 'standalone',
        background_color: '#0f1115',
        theme_color: '#0f1115',
        icons: [
          icone512 && { src: icone512, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/carte-icone.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ].filter(Boolean),
      };
      blobUrl = URL.createObjectURL(
        new Blob([JSON.stringify(manifeste)], { type: 'application/manifest+json' }),
      );
      lien.setAttribute('href', blobUrl);
    }

    return () => {
      document.title = prevTitre;
      if (apple && prevApple != null) apple.setAttribute('href', prevApple);
      if (lien && prevManifest) lien.setAttribute('href', prevManifest);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (metaCree) meta.remove();
      else if (meta && prevMeta != null) meta.setAttribute('content', prevMeta);
    };
  }, [magasin]);

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

  // Bouton Apple Wallet : masqué tant que VITE_WALLET_ACTIF n'est pas activé
  // (le temps de configurer le certificat Apple + déployer l'Edge Function).
  const walletActif = import.meta.env.VITE_WALLET_ACTIF === 'true';
  const walletUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/carte-wallet?c=${clientId}`;

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
          <QRClient clientId={clientId} token={etat.token} taille={200} />
          <p className="statut">📲 Montre ce QR au comptoir pour cumuler tes étoiles.</p>
        </div>

        {walletActif && iOS && (
          <a className="btn btn-wallet" href={walletUrl}>
             Ajouter à Apple Wallet
          </a>
        )}

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
