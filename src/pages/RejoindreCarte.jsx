import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { NOM } from '../lib/marque';

// Page PUBLIQUE — auto-inscription d'un client via le QR du magasin
// (/rejoindre/<magasinId>). Le visiteur saisit un surnom + son téléphone, donne
// son consentement, et obtient aussitôt sa carte de fidélité (/carte/<id>),
// qu'il peut ajouter à son écran d'accueil. +1 étoile offerte à l'inscription.
export default function RejoindreCarte() {
  const { magasinId } = useParams();
  const navigate = useNavigate();
  const [surnom, setSurnom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [consent, setConsent] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  // Déjà inscrit sur cet appareil pour ce magasin ? → on file droit à sa carte.
  useEffect(() => {
    document.title = 'Ma carte de fidélité';
    const dejaId = localStorage.getItem(`carte:${magasinId}`);
    if (dejaId) navigate(`/carte/${dejaId}`, { replace: true });
  }, [magasinId, navigate]);

  async function envoyer(e) {
    e.preventDefault();
    setErreur('');
    const s = surnom.trim();
    const t = telephone.trim();
    if (!s) return setErreur('Choisis un surnom.');
    if (!t) return setErreur('Indique ton numéro de téléphone.');
    if (!consent) return setErreur('Coche la case de consentement pour continuer.');

    setEnvoi(true);
    const { data, error } = await supabase.rpc('inscription_client_publique', {
      p_magasin: magasinId,
      p_surnom: s,
      p_telephone: t,
    });
    setEnvoi(false);
    if (error || !data) {
      setErreur(error?.message || "Impossible de créer la carte. Vérifie le QR du magasin.");
      return;
    }
    localStorage.setItem(`carte:${magasinId}`, data);
    navigate(`/carte/${data}`, { replace: true });
  }

  return (
    <div className="page-connexion">
      <form className="card carte-connexion" onSubmit={envoyer}>
        <span className="logo">{NOM}</span>
        <h1 className="logo-connexion">🎟️ Ma carte de fidélité</h1>
        <p className="statut">
          Crée ta carte de fidélité en quelques secondes et reçois <strong>1 étoile de
          bienvenue</strong> ★. Ensuite, le magasin ajoute tes étoiles à chaque passage.
        </p>

        <label className="field">
          <span>Surnom</span>
          <input
            autoFocus
            value={surnom}
            onChange={(e) => setSurnom(e.target.value)}
            placeholder="ex. Le Grand, Mimi…"
            maxLength={40}
          />
        </label>
        <label className="field">
          <span>Téléphone</span>
          <input
            type="tel"
            inputMode="tel"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            placeholder="ex. 06 12 34 56 78"
            maxLength={20}
          />
        </label>

        <label className="case-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            J’accepte que le magasin conserve mon numéro pour ma carte de fidélité et d’éventuelles
            offres. Aucune autre donnée n’est enregistrée.
          </span>
        </label>

        {erreur && <p className="message-erreur">{erreur}</p>}

        <button className="btn btn-primary" type="submit" disabled={envoi}>
          {envoi ? 'Création…' : 'Créer ma carte'}
        </button>
      </form>
    </div>
  );
}
