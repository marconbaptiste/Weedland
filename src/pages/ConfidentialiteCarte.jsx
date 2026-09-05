import { Link, useSearchParams } from 'react-router-dom';
import { NOM, VERSION_LEGAL } from '../lib/marque';

// Notice d'information RGPD (art. 13) pour les CLIENTS FINAUX des magasins :
// page publique, courte, liée depuis l'inscription QR et la carte de fidélité.
// Le magasin est le responsable de traitement ; l'exploitant est sous-traitant.
export default function ConfidentialiteCarte() {
  const [params] = useSearchParams();
  const magasin = params.get('magasin')?.trim();
  const qui = magasin ? <strong>{magasin}</strong> : 'le magasin qui vous a remis cette carte';

  return (
    <div className="legal">
      <h1>Vos données — carte de fidélité</h1>
      <p className="legal-maj">Version du {VERSION_LEGAL}</p>

      <h2>Qui traite vos données ?</h2>
      <p>
        {qui} est <strong>responsable du traitement</strong>. Il utilise l’application {NOM}, dont
        l’éditeur agit comme <strong>sous-traitant</strong> (hébergement et fonctionnement technique)
        et n’utilise jamais vos données pour son propre compte.
      </p>

      <h2>Quelles données, pour quoi ?</h2>
      <p>
        <strong>Surnom</strong> et <strong>numéro de téléphone</strong>&nbsp;: retrouver votre carte et
        éviter les doublons (exécution de votre demande de carte). <strong>Tampons et récompenses</strong>&nbsp;:
        fonctionnement de la fidélité. <strong>Adresse</strong>&nbsp;: uniquement si vous demandez une
        livraison. <strong>Notifications</strong>&nbsp;: uniquement si vous les activez sur votre carte
        (consentement, retirable à tout moment depuis la carte). <strong>Offres par téléphone</strong>&nbsp;:
        uniquement si vous avez coché la case correspondante (consentement, retirable auprès du
        magasin). Aucune donnée n’est vendue ni transmise à des fins publicitaires.
      </p>

      <h2>Combien de temps ?</h2>
      <p>
        Pendant la durée de votre relation avec le magasin, puis au plus 3 ans après votre dernier
        passage. Les opérations comptables (avances, remboursements) sont conservées le temps légal,
        sous une forme ne permettant plus de vous identifier après effacement.
      </p>

      <h2>Où ?</h2>
      <p>
        Dans l’Union européenne (hébergeur Supabase). Les notifications transitent par le service
        de notification de votre téléphone (Apple / Google).
      </p>

      <h2>Vos droits</h2>
      <p>
        Accès, rectification, effacement, limitation, opposition, portabilité, retrait du
        consentement&nbsp;: adressez-vous <strong>au magasin</strong> (au comptoir ou par téléphone —
        ses coordonnées figurent sur votre carte). Il peut supprimer votre carte et anonymiser vos
        données immédiatement. Vous pouvez aussi saisir la CNIL (www.cnil.fr).
      </p>

      <h2>Bon à savoir</h2>
      <p>
        Le lien de votre carte est personnel&nbsp;: ne le partagez pas. Aucun cookie publicitaire ni
        traceur n’est utilisé.
      </p>

      <footer className="landing-pied">
        <nav className="landing-liens">
          <Link to="/confidentialite">Politique de confidentialité complète</Link>
        </nav>
      </footer>
    </div>
  );
}
