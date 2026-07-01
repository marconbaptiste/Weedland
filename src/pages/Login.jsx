import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import Logo from '../components/Logo';

export default function Login() {
  const { connexion, connexionGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    setEnvoi(true);
    const { error } = await connexion(email.trim(), motDePasse);
    setEnvoi(false);
    if (error) {
      setErreur('Identifiants incorrects.');
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
