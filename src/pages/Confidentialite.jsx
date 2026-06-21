import { Link } from 'react-router-dom';
import { NOM, EDITEUR } from '../lib/marque';

// Politique de confidentialité (RGPD) — MODÈLE à faire valider par un juriste.
export default function Confidentialite() {
  return (
    <div className="legal">
      <header className="landing-tete">
        <Link to="/presentation" className="logo">{NOM}</Link>
        <Link to="/connexion" className="btn btn-discret">Se connecter</Link>
      </header>

      <h1>Politique de confidentialité</h1>
      <p className="legal-maj">Dernière mise à jour : {new Date().toLocaleDateString('fr-FR')}</p>

      <div className="legal-avis">
        ⚠️ Modèle fourni à titre indicatif. À faire vérifier et compléter par un professionnel du
        droit / DPO avant toute exploitation commerciale.
      </div>

      <h2>1. Responsable et rôles</h2>
      <p>
        {EDITEUR.societe} ({EDITEUR.email}) édite le Service {NOM}. Pour les données saisies dans un
        magasin, le commerce utilisateur (son administrateur) agit en tant que <strong>responsable
        de traitement</strong> ; {EDITEUR.societe} agit en tant que <strong>sous-traitant</strong>,
        traitant les données pour le compte du magasin afin de fournir le Service.
      </p>

      <h2>2. Données traitées</h2>
      <p>
        <strong>Comptes</strong>&nbsp;: email, nom, rôle, magasin de rattachement, taux
        d’intéressement. <br />
        <strong>Données d’exploitation</strong> saisies par le magasin&nbsp;: clôtures de caisse,
        ventes, stocks, charges, fournisseurs, paiements employés. <br />
        <strong>Clients du magasin</strong>&nbsp;: identifiés uniquement par un <strong>surnom</strong>{' '}
        et une description interne, ainsi que le solde dû. Aucune donnée d’identité réelle (nom,
        prénom, coordonnées) n’est demandée ni stockée. <br />
        <strong>Données techniques</strong>&nbsp;: informations de connexion (via Supabase Auth /
        Google), et stockage local du navigateur pour des préférences d’affichage.
      </p>

      <h2>3. Finalités et base légale</h2>
      <p>
        Les données sont traitées pour fournir et sécuriser le Service (exécution du contrat) et pour
        assurer son bon fonctionnement (intérêt légitime). Aucune donnée n’est vendue ni utilisée à
        des fins publicitaires.
      </p>

      <h2>4. Hébergement et sous-traitants</h2>
      <p>
        Les données sont hébergées sur <strong>Supabase</strong> (base de données PostgreSQL, région
        Union européenne) et <strong>Vercel</strong> (hébergement de l’application). L’authentification
        peut utiliser <strong>Google</strong> (connexion OAuth). Ces prestataires agissent comme
        sous-traitants ultérieurs.
      </p>

      <h2>5. Sécurité</h2>
      <p>
        Les accès sont protégés par authentification et par un cloisonnement strict des données
        (chaque magasin n’accède qu’aux siennes, via des règles de sécurité au niveau de la base —
        RLS). Les communications sont chiffrées (HTTPS). Les clés sensibles ne sont jamais exposées
        côté navigateur.
      </p>

      <h2>6. Durée de conservation</h2>
      <p>
        Les données sont conservées pendant la durée d’utilisation du Service par le magasin, puis
        supprimées ou anonymisées dans un délai raisonnable après la clôture du compte, sous réserve
        des obligations légales de conservation (notamment comptables).
      </p>

      <h2>7. Vos droits</h2>
      <p>
        Conformément au RGPD, vous disposez des droits d’accès, de rectification, d’effacement, de
        limitation, d’opposition et de portabilité. Pour les exercer, contactez {EDITEUR.email}. Les
        demandes relatives aux données d’un magasin sont à adresser à l’administrateur du magasin
        concerné (responsable de traitement). Vous pouvez introduire une réclamation auprès de la
        CNIL (www.cnil.fr).
      </p>

      <h2>8. Cookies et stockage local</h2>
      <p>
        Le Service n’utilise pas de cookies publicitaires ni de traceurs tiers. Il utilise un
        stockage technique (session d’authentification, préférences comme le guide de démarrage)
        nécessaire à son fonctionnement.
      </p>

      <h2>9. Contact</h2>
      <p>Pour toute question relative à vos données&nbsp;: {EDITEUR.email}.</p>

      <footer className="landing-pied">
        <nav className="landing-liens">
          <Link to="/presentation">Accueil</Link>
          <Link to="/cgu">CGU</Link>
        </nav>
      </footer>
    </div>
  );
}
