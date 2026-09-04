import { Link } from 'react-router-dom';
import { NOM, EDITEUR, VERSION_LEGAL, SOUS_TRAITANTS } from '../lib/marque';
import { SOCLE, OPTIONS_TARIFS, PACKS } from '../lib/tarifs';

// Conditions Générales de Vente (abonnement SaaS, clients professionnels) +
// Accord de traitement des données (art. 28 RGPD) en annexe.
// MODÈLE à faire valider par un avocat avant le premier client payant.
export default function CGV() {
  return (
    <div className="legal">
      <header className="landing-tete">
        <Link to="/presentation" className="logo">{NOM}</Link>
        <Link to="/connexion" className="btn btn-discret">Se connecter</Link>
      </header>

      <h1>Conditions Générales de Vente</h1>
      <p className="legal-maj">Version du {VERSION_LEGAL}</p>

      <div className="legal-avis">
        ⚠️ Modèle fourni à titre indicatif. À faire vérifier et compléter par un professionnel du
        droit avant toute exploitation commerciale.
      </div>

      <h2>1. Objet</h2>
      <p>
        Les présentes CGV régissent la souscription, par un client <strong>professionnel</strong>{' '}
        (le «&nbsp;Magasin&nbsp;»), à l’abonnement au logiciel en ligne {NOM} (le «&nbsp;Service&nbsp;»)
        édité par {EDITEUR.societe} (l’«&nbsp;Éditeur&nbsp;»). Elles complètent les{' '}
        <Link to="/cgu">Conditions Générales d’Utilisation</Link> et la{' '}
        <Link to="/confidentialite">Politique de confidentialité</Link>. Toute souscription vaut
        acceptation des CGV en vigueur à la date de la commande.
      </p>

      <h2>2. Description du Service et prix</h2>
      <p>
        Le socle «&nbsp;Comptoir&nbsp;» comprend la caisse, le suivi des dettes clients, la
        comptabilité de base et la gestion des comptes, pour <strong>{SOCLE} € HT par mois et par
        magasin</strong>. Des options peuvent être ajoutées ou retirées à tout moment depuis le Service&nbsp;:
      </p>
      <ul>
        {OPTIONS_TARIFS.map((o) => (
          <li key={o.cle}>
            {o.nom}&nbsp;: {o.prix} € HT/mois — {o.detail}.
          </li>
        ))}
      </ul>
      <p>
        Plafonds de prix («&nbsp;packs&nbsp;»), appliqués automatiquement&nbsp;:{' '}
        {PACKS.map((p) => `${p.nom} ${p.prix} € HT/mois`).join(' · ')}. Les prix s’entendent hors
        taxes&nbsp;; la TVA applicable est ajoutée sur la facture ({EDITEUR.tva}). L’Éditeur peut
        modifier ses tarifs avec un préavis de 30 jours notifié dans le Service ou par email&nbsp;; le
        Magasin peut alors résilier sans frais avant l’entrée en vigueur.
      </p>

      <h2>3. Période d’essai</h2>
      <p>
        Toute création de magasin ouvre une période d’essai gratuite de <strong>14 jours</strong> donnant
        accès à l’ensemble des fonctionnalités, sans moyen de paiement. À son terme, l’accès est
        suspendu jusqu’à souscription d’un abonnement&nbsp;; les données sont conservées (voir art. 8)
        et restent exportables.
      </p>

      <h2>4. Commande, durée, facturation</h2>
      <p>
        L’abonnement est souscrit en ligne (paiement par carte via Stripe), pour une durée d’un mois{' '}
        <strong>renouvelable tacitement</strong>, sans engagement de durée. La facture est émise à chaque
        échéance et disponible dans le portail de facturation. L’ajout d’une option en cours de mois est
        facturé au prorata. À défaut de paiement à l’échéance, des pénalités de retard égales à trois fois
        le taux d’intérêt légal et une indemnité forfaitaire de recouvrement de 40 € (art. L441-10 C. com.)
        sont exigibles de plein droit, et l’accès au Service peut être suspendu après échec des
        tentatives de prélèvement, jusqu’à régularisation.
      </p>

      <h2>5. Résiliation</h2>
      <p>
        Le Magasin peut résilier à tout moment depuis le portail de facturation&nbsp;: la résiliation
        prend effet à la fin de la période en cours, sans remboursement du mois entamé. L’Éditeur peut
        résilier en cas de manquement grave aux CGU (usage illicite, atteinte à la sécurité) après mise
        en demeure restée sans effet 15 jours, ou avec un préavis de 3 mois en cas d’arrêt du Service.
      </p>

      <h2>6. Droit de rétractation</h2>
      <p>
        Le Service étant réservé aux professionnels et la période d’essai permettant de le tester,
        aucun droit de rétractation ne s’applique (art. L221-3 du Code de la consommation).
      </p>

      <h2>7. Obligations et responsabilité</h2>
      <p>
        L’Éditeur s’engage à fournir le Service avec diligence, et vise une disponibilité de 99 %
        mensuelle hors maintenance planifiée, sans garantie de résultat. Le Service est un{' '}
        <strong>outil d’aide</strong>&nbsp;: les calculs (chiffre d’affaires, intéressement, estimations de
        TVA, bulletins), les contenus générés par intelligence artificielle (bulletin «&nbsp;News&nbsp;»,
        fiche molécules, reconnaissance de texte) et les informations réglementaires sont fournis à titre
        indicatif et ne constituent ni un conseil comptable, ni juridique. Le Magasin reste seul
        responsable de sa comptabilité, de ses déclarations, de la licéité de son activité et de ses
        communications à ses clients. La responsabilité de l’Éditeur est limitée aux dommages directs et
        plafonnée au montant des sommes versées au cours des 12 derniers mois.
      </p>

      <h2>8. Données, réversibilité, suppression</h2>
      <p>
        Les données saisies restent la propriété du Magasin, qui peut les exporter à tout moment
        (Gestion → Exporter mes données), y compris lorsque l’accès est suspendu. À la résiliation, les
        données sont conservées <strong>90 jours</strong> pour permettre une réactivation ou un export,
        puis supprimées définitivement (sauf obligations légales de conservation de l’Éditeur). Le Magasin
        peut demander une suppression anticipée. Le traitement des données personnelles est régi par
        l’annexe ci-dessous.
      </p>

      <h2>9. Droit applicable</h2>
      <p>
        Les présentes sont soumises au droit français. Tout litige relève du tribunal de commerce du
        siège de l’Éditeur, après tentative de règlement amiable.
      </p>

      <h1>Annexe — Accord de traitement des données (art. 28 RGPD)</h1>
      <p>
        <strong>Rôles.</strong> Le Magasin est responsable du traitement des données de ses employés et
        de ses clients&nbsp;; l’Éditeur est sous-traitant et ne traite ces données que sur instruction
        documentée du Magasin (les présentes et l’usage du Service).
      </p>
      <p>
        <strong>Nature et finalité.</strong> Hébergement, stockage, sauvegarde et mise à disposition
        des données via le Service. <strong>Durée</strong>&nbsp;: durée du contrat + 90 jours.
      </p>
      <p>
        <strong>Catégories de personnes et de données.</strong> Employés (nom, email, rôle, taux
        d’intéressement, horaires, paiements, bulletins) ; clients du Magasin (surnom, téléphone,
        adresse de livraison, dettes, tampons, abonnement aux notifications, consentements) ;
        fournisseurs (factures et justificatifs photographiés).
      </p>
      <p>
        <strong>Sécurité (art. 32).</strong> Cloisonnement par magasin au niveau de la base de données
        (Row Level Security), chiffrement en transit (HTTPS/HSTS) et au repos, authentification avec mot
        de passe (8 caractères minimum) ou Google, journaux d’audit des opérations sensibles, sauvegardes
        quotidiennes chiffrées (AES-256, 30 jours), accès de l’Éditeur limité au support.
      </p>
      <p>
        <strong>Sous-traitants ultérieurs</strong> (autorisation générale ; tout changement est notifié
        dans le Service avec 30 jours pour s’y opposer)&nbsp;:
      </p>
      <ul>
        {SOUS_TRAITANTS.map((s) => (
          <li key={s.nom}>
            <strong>{s.nom}</strong> — {s.role} ({s.lieu}).
          </li>
        ))}
      </ul>
      <p>
        <strong>Assistance et droits des personnes.</strong> Le Service permet au Magasin de répondre
        lui-même aux demandes (export, rectification, anonymisation d’un client, désactivation d’un
        employé). L’Éditeur assiste le Magasin pour toute demande qu’il ne peut traiter seul.
      </p>
      <p>
        <strong>Violation de données.</strong> L’Éditeur notifie le Magasin sans délai injustifié et au
        plus tard 48 h après en avoir eu connaissance, avec les informations nécessaires à sa propre
        notification à la CNIL.
      </p>
      <p>
        <strong>Fin de contrat.</strong> Restitution par export, puis suppression selon l’art. 8.{' '}
        <strong>Audit.</strong> L’Éditeur met à disposition la documentation nécessaire et accepte un
        audit annuel raisonnable, à la charge du Magasin.
      </p>

      <footer className="landing-pied">
        <nav className="landing-liens">
          <Link to="/presentation">Accueil</Link>
          <Link to="/cgu">CGU</Link>
          <Link to="/confidentialite">Confidentialité</Link>
          <Link to="/mentions-legales">Mentions légales</Link>
        </nav>
      </footer>
    </div>
  );
}
