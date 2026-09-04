import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { urlLogo } from '../lib/logo';

// Page PUBLIQUE — auto-inscription d'un client via le QR du magasin
// (/rejoindre/<magasinId>). Le visiteur saisit un surnom + son téléphone, donne
// son consentement, et obtient aussitôt sa carte de fidélité (/carte/<id>),
// qu'il peut ajouter à son écran d'accueil. Deux consentements distincts (carte
// obligatoire / offres facultatif), horodatés côté base. La carte démarre à 0.
export default function RejoindreCarte() {
  const { magasinId } = useParams();
  const navigate = useNavigate();
  const [surnom, setSurnom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [consent, setConsent] = useState(false); // carte (obligatoire)
  const [offres, setOffres] = useState(false); // offres par téléphone (facultatif)
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [magasin, setMagasin] = useState(null); // { nom, logo } — branding du magasin

  // Déjà inscrit sur cet appareil pour ce magasin ? → on file droit à sa carte.
  useEffect(() => {
    document.title = 'Ma carte de fidélité';
    const dejaId = localStorage.getItem(`carte:${magasinId}`);
    if (dejaId) navigate(`/carte/${dejaId}`, { replace: true });
  }, [magasinId, navigate]);

  // Nom + logo du magasin (white-label : on affiche le magasin, pas « Kanabiz »).
  useEffect(() => {
    supabase
      .rpc('magasin_infos_publique', { p_magasin: magasinId })
      .then(({ data }) => {
        const m = data?.[0];
        if (m) {
          setMagasin(m);
          document.title = `Carte de fidélité – ${m.nom}`;
        }
      });
  }, [magasinId]);

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
      p_offres: offres,
    });
    setEnvoi(false);
    if (error) {
      setErreur(error.message || "Impossible de créer la carte. Vérifie le QR du magasin.");
      return;
    }
    // Pas d'id renvoyé = ce numéro est déjà associé à une carte. On ne divulgue
    // pas l'UUID de la carte existante (anti-oracle) : on oriente vers le comptoir.
    if (!data) {
      setErreur(
        'Ce numéro est déjà associé à une carte de fidélité. Demande au comptoir du magasin pour la retrouver.',
      );
      return;
    }
    localStorage.setItem(`carte:${magasinId}`, data);
    navigate(`/carte/${data}`, { replace: true });
  }

  return (
    <div className="page-connexion">
      <form className="card carte-connexion" onSubmit={envoyer}>
        {magasin?.logo && (
          <img className="carte-logo" src={urlLogo(magasin.logo)} alt={magasin.nom || 'Logo du magasin'} />
        )}
        {magasin?.nom && <span className="logo carte-nom-magasin">{magasin.nom}</span>}
        <h1 className="logo-connexion">🎟️ Ma carte de fidélité</h1>
        <p className="statut">
          Crée ta carte de fidélité en quelques secondes. ★ Le magasin ajoute tes étoiles à
          chaque passage.
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
            Je crée ma carte de fidélité&nbsp;: mon surnom et mon numéro servent uniquement à retrouver
            ma carte et à éviter les doublons. <strong>(obligatoire)</strong>
          </span>
        </label>
        <label className="case-consent">
          <input type="checkbox" checked={offres} onChange={(e) => setOffres(e.target.checked)} />
          <span>
            J’accepte que {magasin?.nom || 'le magasin'} me contacte par téléphone/SMS pour ses offres.{' '}
            <em>(facultatif, retirable à tout moment auprès du magasin)</em>
          </span>
        </label>
        <p className="statut" style={{ fontSize: '0.8rem' }}>
          Responsable du traitement&nbsp;: {magasin?.nom || 'le magasin'}. Conservation 3 ans max après
          ton dernier passage. Tes droits (accès, effacement…) s’exercent auprès du magasin.{' '}
          <Link to={`/confidentialite-carte?magasin=${encodeURIComponent(magasin?.nom || '')}`} target="_blank">
            En savoir plus
          </Link>
        </p>

        {erreur && <p className="message-erreur">{erreur}</p>}

        <button className="btn btn-primary" type="submit" disabled={envoi}>
          {envoi ? 'Création…' : 'Créer ma carte'}
        </button>
      </form>
    </div>
  );
}
