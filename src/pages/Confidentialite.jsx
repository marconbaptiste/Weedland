import { Link } from 'react-router-dom';
import { NOM, EDITEUR, VERSION_LEGAL, SOUS_TRAITANTS } from '../lib/marque';

// Politique de confidentialité (RGPD) — MODÈLE à faire valider par un juriste.
// Rédigée à partir du code réel : chaque catégorie de données citée existe en
// base ; tenir cette page à jour à chaque nouvelle donnée personnelle stockée.
export default function Confidentialite() {
  return (
    <div className="legal">
      <header className="landing-tete">
        <Link to="/presentation" className="logo">{NOM}</Link>
        <Link to="/connexion" className="btn btn-discret">Se connecter</Link>
      </header>

      <h1>Politique de confidentialité</h1>
      <p className="legal-maj">Version du {VERSION_LEGAL}</p>

      <div className="legal-avis">
        ⚠️ Modèle fourni à titre indicatif. À faire vérifier et compléter par un professionnel du
        droit / DPO avant toute exploitation commerciale.
      </div>

      <h2>1. Responsable et rôles</h2>
      <p>
        {EDITEUR.societe} ({EDITEUR.email}) édite le Service {NOM}. Pour les données saisies dans un
        magasin, le commerce utilisateur (son administrateur) agit en tant que <strong>responsable
        de traitement</strong>&nbsp;; {EDITEUR.societe} agit en tant que <strong>sous-traitant</strong>{' '}
        (accord de traitement en annexe des <Link to="/cgv">CGV</Link>). Pour les données de compte des
        administrateurs (facturation, support), l’Éditeur est responsable de traitement.
      </p>

      <h2>2. Données traitées, par catégorie de personnes</h2>
      <p>
        <strong>Administrateurs et employés des magasins</strong>&nbsp;: email, nom, rôle, magasin de
        rattachement, taux d’intéressement, horaires fixes et plannings, paiements et bulletins de
        paie saisis par l’employeur, opérations réalisées (clôtures, avances, mouvements de stock —
        journaux d’audit horodatés), messages adressés au support. Base légale&nbsp;: exécution du
        contrat (employeur) et intérêt légitime (sécurité, traçabilité).
      </p>
      <p>
        <strong>Clients des magasins</strong> (carte de fidélité)&nbsp;: surnom, description interne,
        numéro de téléphone (dédoublonnage de la carte ; offres uniquement avec consentement séparé),
        adresse de livraison (uniquement pour une commande), solde d’avances, tampons et récompenses,
        abonnement aux notifications (identifiant technique du navigateur, avec consentement,
        retirable depuis la carte), consentements horodatés. Aucun nom réel n’est demandé. Notice
        dédiée&nbsp;: <Link to="/confidentialite-carte">Vos données — carte de fidélité</Link>.
      </p>
      <p>
        <strong>Fournisseurs</strong>&nbsp;: libellés, montants et photos de factures/tickets
        (justificatifs) stockés dans un espace privé cloisonné par magasin.
      </p>
      <p>
        <strong>Données de facturation</strong> (administrateur)&nbsp;: nom du magasin, email, adresse
        de facturation, moyen de paiement — traités par Stripe (l’Éditeur ne voit jamais le numéro de
        carte).
      </p>
      <p>
        <strong>Données techniques</strong>&nbsp;: session d’authentification (Supabase Auth / Google),
        journaux d’accès des hébergeurs (adresse IP, navigateur), stockage local du navigateur pour les
        brouillons de saisie et préférences d’affichage.
      </p>

      <h2>3. Finalités et base légale</h2>
      <p>
        Fournir et sécuriser le Service (exécution du contrat), facturer l’abonnement (contrat et
        obligations légales), assurer la traçabilité des opérations sensibles et prévenir la fraude
        (intérêt légitime), envoyer des notifications ou des offres aux clients finaux (consentement).
        Aucune donnée n’est vendue ni utilisée à des fins publicitaires. Le bulletin «&nbsp;News&nbsp;»
        est généré par une intelligence artificielle (Anthropic) à partir de sources web publiques et
        des seuls noms/catégories de produits du stock — aucune donnée personnelle ne lui est transmise.
      </p>

      <h2>4. Hébergement et sous-traitants ultérieurs</h2>
      <p>
        Les données sont hébergées dans l’Union européenne (Supabase). Les prestataires suivants
        interviennent, sous contrat (clauses contractuelles types pour les transferts hors UE)&nbsp;:
      </p>
      <ul>
        {SOUS_TRAITANTS.map((s) => (
          <li key={s.nom}>
            <strong>{s.nom}</strong> — {s.role} ({s.lieu}).
          </li>
        ))}
      </ul>

      <h2>5. Sécurité</h2>
      <p>
        Cloisonnement strict des données par magasin au niveau de la base (Row Level Security),
        chiffrement des communications (HTTPS/HSTS) et des données au repos, clés sensibles jamais
        exposées au navigateur, journaux d’audit inaltérables pour les opérations sensibles, sauvegardes
        quotidiennes chiffrées (AES-256) conservées 30 jours. En cas de violation de données, les
        magasins concernés sont informés sous 48 h.
      </p>

      <h2>6. Durée de conservation</h2>
      <ul>
        <li>Données de compte et d’exploitation&nbsp;: durée de l’abonnement, puis 90 jours (réactivation ou export), puis suppression.</li>
        <li>Données comptables (clôtures, avances, charges, justificatifs)&nbsp;: restituées au magasin, qui les conserve 10 ans (art. L123-22 C. com.)&nbsp;; supprimées chez l’Éditeur à la fin du contrat.</li>
        <li>Clients finaux&nbsp;: au plus 3 ans après le dernier passage, ou immédiatement sur demande (anonymisation).</li>
        <li>Journaux techniques et d’audit&nbsp;: 12 mois. Sauvegardes&nbsp;: 30 jours.</li>
        <li>Magasins en essai non convertis&nbsp;: 90 jours après la fin de l’essai.</li>
      </ul>

      <h2>7. Vos droits</h2>
      <p>
        Conformément au RGPD, vous disposez des droits d’accès, de rectification, d’effacement, de
        limitation, d’opposition, de portabilité et de retrait du consentement. Les employés et clients
        d’un magasin s’adressent à <strong>l’administrateur du magasin</strong> (responsable de
        traitement), qui dispose dans le Service des outils nécessaires (export, anonymisation d’un
        client, désactivation d’un compte). Les administrateurs s’adressent à {EDITEUR.email}. Réponse
        sous un mois. Vous pouvez introduire une réclamation auprès de la CNIL (www.cnil.fr).
      </p>

      <h2>8. Cookies et stockage local</h2>
      <p>
        Le Service n’utilise ni cookie publicitaire ni traceur tiers, et aucun outil de mesure
        d’audience. Il utilise uniquement un stockage technique exempté de consentement&nbsp;: session
        d’authentification, brouillons de saisie non enregistrés (le temps de la session), préférences
        d’affichage, et sur la carte de fidélité l’identifiant de la carte pour la retrouver sur
        l’appareil.
      </p>

      <h2>9. Contact</h2>
      <p>Pour toute question relative à vos données&nbsp;: {EDITEUR.email}.</p>

      <footer className="landing-pied">
        <nav className="landing-liens">
          <Link to="/presentation">Accueil</Link>
          <Link to="/cgv">CGV</Link>
          <Link to="/cgu">CGU</Link>
          <Link to="/mentions-legales">Mentions légales</Link>
        </nav>
      </footer>
    </div>
  );
}
