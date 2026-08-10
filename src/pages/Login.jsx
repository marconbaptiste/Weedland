import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import Logo from '../components/Logo';

export default function Login() {
  const { connexion, connexionGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [aide, setAide] = useState(false); // encart « mot de passe oublié »
  const [resetEnvoi, setResetEnvoi] = useState(false);
  const [infoReset, setInfoReset] = useState('');

  async function envoyerReset() {
    setErreur('');
    setInfoReset('');
    const mail = email.trim().toLowerCase();
    if (!mail) {
      setErreur('Saisis d’abord ton email ci-dessus, puis clique sur « Recevoir un lien ».');
      return;
    }
    setResetEnvoi(true);
    const { error } = await supabase.auth.resetPasswordForEmail(mail, {
      redirectTo: `${window.location.origin}/nouveau-mot-de-passe`,
    });
    setResetEnvoi(false);
    if (error) {
      console.error('resetPasswordForEmail:', error);
      setErreur('Envoi impossible pour le moment. Réessaie dans un instant.');
      return;
    }
    setInfoReset(
      '📧 Si un compte existe pour cet email, un lien de réinitialisation vient d’être envoyé. Pense à vérifier tes spams.',
    );
  }

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    setEnvoi(true);
    const { error } = await connexion(email.trim(), motDePasse);
    setEnvoi(false);
    if (error) {
      setErreur('Email ou mot de passe incorrect. Vérifie bien les deux.');
      return;
    }
    navigate('/', { replace: true });
  }

  async function google() {
    setErreur('');
    // Redirige vers Google ; au retour, la session est rétablie automatiquement.
    const { error } = await connexionGoogle();
    if (error) setErreur('Connexion Google indisponible.');
  }

  return (
    <div className="page-connexion">
      <form className="card carte-connexion" onSubmit={soumettre}>
        <Logo taille={40} className="marque-hero" />
        <p className="statut" style={{ marginTop: '-0.25rem' }}>Connecte-toi à ton espace</p>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="field">
          <span>Mot de passe</span>
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {erreur && <p className="message-erreur">{erreur}</p>}
        <button className="btn btn-primary" type="submit" disabled={envoi}>
          {envoi ? 'Connexion…' : 'Se connecter'}
        </button>

        <button
          type="button"
          className="btn btn-discret lien-oubli"
          onClick={() => setAide((a) => !a)}
        >
          Mot de passe oublié ?
        </button>
        {aide && (
          <div className="encart-aide">
            <p className="statut" style={{ marginTop: 0 }}>
              Saisis ton email en haut, puis reçois un lien pour choisir un nouveau mot de passe :
            </p>
            <button
              type="button"
              className="btn"
              onClick={envoyerReset}
              disabled={resetEnvoi}
            >
              {resetEnvoi ? 'Envoi…' : '📧 Recevoir un lien par email'}
            </button>
            {infoReset && <p className="statut">{infoReset}</p>}
            <p className="statut" style={{ marginBottom: 0 }}>
              Tu peux aussi demander à ton responsable de le réinitialiser (menu{' '}
              <strong>Comptes → Gérer → Réinit. mot de passe</strong>).
            </p>
          </div>
        )}

        <div className="separateur"><span>ou</span></div>

        <button className="btn btn-google" type="button" onClick={google}>
          <span className="g-logo" aria-hidden="true">G</span>
          Se connecter avec Google
        </button>

        <Link to="/inscription" className="statut" style={{ textAlign: 'center' }}>
          Créer un nouveau magasin
        </Link>
        <nav className="landing-liens">
          <Link to="/cgu">CGU</Link>
          <Link to="/confidentialite">Confidentialité</Link>
        </nav>
      </form>
    </div>
  );
}
