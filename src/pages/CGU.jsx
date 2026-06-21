import { Link } from 'react-router-dom';
import { NOM, EDITEUR } from '../lib/marque';

// Conditions Générales d'Utilisation — MODÈLE à faire valider par un juriste.
export default function CGU() {
  return (
    <div className="legal">
      <header className="landing-tete">
        <Link to="/presentation" className="logo">{NOM}</Link>
        <Link to="/connexion" className="btn btn-discret">Se connecter</Link>
      </header>

      <h1>Conditions Générales d’Utilisation</h1>
      <p className="legal-maj">Dernière mise à jour : {new Date().toLocaleDateString('fr-FR')}</p>

      <div className="legal-avis">
        ⚠️ Modèle fourni à titre indicatif. À faire vérifier et compléter par un professionnel du
        droit avant toute exploitation commerciale.
      </div>

      <h2>1. Objet</h2>
      <p>
        Les présentes CGU régissent l’accès et l’utilisation de l’application {NOM} (ci-après «&nbsp;le
        Service&nbsp;»), un outil de gestion destiné aux commerces (caisse, suivi des dettes clients,
        stocks, comptabilité). L’utilisation du Service implique l’acceptation pleine et entière des
        présentes CGU.
      </p>

      <h2>2. Éditeur</h2>
      <p>
        Le Service est édité par {EDITEUR.societe} ({EDITEUR.forme}), {EDITEUR.siege}, immatriculée
        sous le numéro {EDITEUR.siret} ({EDITEUR.rcs}). Directeur de la publication&nbsp;:{' '}
        {EDITEUR.directeur}. Contact&nbsp;: {EDITEUR.email}. Hébergement&nbsp;: {EDITEUR.hebergeur}.
      </p>

      <h2>3. Accès et comptes</h2>
      <p>
        L’accès est réservé aux utilisateurs autorisés. La création d’un magasin nécessite un code
        d’inscription fourni par l’éditeur. Chaque utilisateur est responsable de la confidentialité
        de ses identifiants et de toute activité réalisée depuis son compte. L’administrateur d’un
        magasin est responsable des comptes qu’il crée.
      </p>

      <h2>4. Obligations de l’utilisateur</h2>
      <p>
        L’utilisateur s’engage à&nbsp;: utiliser le Service conformément à la loi et à exercer une
        activité licite&nbsp;; fournir des informations exactes&nbsp;; ne pas tenter de compromettre
        la sécurité ou l’intégrité du Service&nbsp;; respecter la réglementation applicable à son
        activité et à la protection des données de ses propres clients.
      </p>

      <h2>5. Disponibilité</h2>
      <p>
        L’éditeur s’efforce d’assurer la disponibilité du Service mais ne garantit pas un
        fonctionnement ininterrompu. Des opérations de maintenance, mises à jour ou incidents
        techniques peuvent entraîner des interruptions temporaires.
      </p>

      <h2>6. Responsabilité</h2>
      <p>
        Le Service est fourni «&nbsp;en l’état&nbsp;». L’éditeur ne saurait être tenu responsable des
        dommages indirects, pertes de données ou pertes d’exploitation résultant de l’utilisation du
        Service, dans les limites permises par la loi. L’utilisateur demeure responsable des données
        qu’il saisit et de leur exactitude.
      </p>

      <h2>7. Propriété intellectuelle</h2>
      <p>
        Le Service, sa structure et ses contenus sont protégés. Aucune cession de droits n’est
        consentie au titre des présentes. Les données saisies par l’utilisateur restent sa propriété.
      </p>

      <h2>8. Données personnelles</h2>
      <p>
        Le traitement des données personnelles est décrit dans la{' '}
        <Link to="/confidentialite">Politique de confidentialité</Link>.
      </p>

      <h2>9. Résiliation</h2>
      <p>
        L’éditeur peut suspendre ou résilier un accès en cas de non-respect des présentes CGU.
        L’utilisateur peut demander la suppression de son compte à tout moment via {EDITEUR.email}.
      </p>

      <h2>10. Modifications</h2>
      <p>
        Les présentes CGU peuvent être modifiées. La version applicable est celle en vigueur au
        moment de l’utilisation du Service.
      </p>

      <h2>11. Droit applicable</h2>
      <p>
        Les présentes CGU sont soumises au droit français. Tout litige relève des juridictions
        compétentes, à défaut de résolution amiable.
      </p>

      <footer className="landing-pied">
        <nav className="landing-liens">
          <Link to="/presentation">Accueil</Link>
          <Link to="/confidentialite">Confidentialité</Link>
        </nav>
      </footer>
    </div>
  );
}
