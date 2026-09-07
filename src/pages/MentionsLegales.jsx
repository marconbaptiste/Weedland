import { Link } from 'react-router-dom';
import { NOM, EDITEUR, VERSION_LEGAL } from '../lib/marque';

// Mentions légales (art. 6-III LCEN) — à compléter dans lib/marque.js.
export default function MentionsLegales() {
  return (
    <div className="legal">
      <header className="landing-tete">
        <Link to="/presentation" className="logo">{NOM}</Link>
        <Link to="/connexion" className="btn btn-discret">Se connecter</Link>
      </header>

      <h1>Mentions légales</h1>
      <p className="legal-maj">Version du {VERSION_LEGAL}</p>

      <h2>Éditeur</h2>
      <p>
        {EDITEUR.societe} ({EDITEUR.forme}), capital {EDITEUR.capital}, siège {EDITEUR.siege},
        immatriculée {EDITEUR.siret} ({EDITEUR.rcs}). N° de TVA&nbsp;: {EDITEUR.tva}. Directeur de la
        publication&nbsp;: {EDITEUR.directeur}. Contact&nbsp;: {EDITEUR.email}.
      </p>

      <h2>Hébergement</h2>
      <p>
        Application web hébergée par <strong>Vercel Inc.</strong>, 440 N Barranca Ave #4133, Covina,
        CA 91723, États-Unis (vercel.com). Base de données, authentification et fichiers hébergés par{' '}
        <strong>Supabase Inc.</strong>, 970 Toa Payoh North #07-04, Singapour 318992 (supabase.com),
        sur des serveurs situés dans l’Union européenne.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        Le Service, sa marque, son interface et son code sont la propriété de l’éditeur. Les données
        saisies par un magasin restent la propriété de ce magasin.
      </p>

      <h2>Données personnelles</h2>
      <p>
        Voir la <Link to="/confidentialite">politique de confidentialité</Link> (utilisateurs) et la{' '}
        <Link to="/confidentialite-carte">notice carte de fidélité</Link> (clients des magasins).
      </p>

      <footer className="landing-pied">
        <nav className="landing-liens">
          <Link to="/presentation">Accueil</Link>
          <Link to="/cgv">CGV</Link>
          <Link to="/cgu">CGU</Link>
          <Link to="/confidentialite">Confidentialité</Link>
        </nav>
      </footer>
    </div>
  );
}
