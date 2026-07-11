import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import BoutonAbonnement from '../components/BoutonAbonnement';
import GestionOptions from '../components/GestionOptions';
import LogoMagasin from '../components/LogoMagasin';

// Hub d'administration (regroupe les anciens liens du menu admin en une seule
// entrée « Gestion » → grille de cartes, plus court et ergonomique sur mobile).
function sections(estSuperadmin, options) {
  return [
    {
      titre: 'Chiffres & pilotage',
      outils: [
        { to: '/comptabilite', emoji: '📈', nom: 'Comptabilité', desc: 'CA, bénéfice, intéressement/heures par employé, exports CSV/PDF.' },
        { to: '/journal', emoji: '🧾', nom: 'Journal', desc: 'Modifications des chromes : qui, quand, quoi.' },
        { to: '/journal-chromes', emoji: '📒', nom: 'Journal chromes', desc: 'Flux d’activité récent (clôtures, chromes, paiements).' },
      ],
    },
    {
      titre: 'Équipe',
      outils: [
        ...(options.planning
          ? [{ to: '/plannings', emoji: '📅', nom: 'Plannings', desc: 'Présentiel des employés, par semaine.' }]
          : []),
        { to: '/paiements', emoji: '💸', nom: 'Paiements', desc: 'Payes des employés du mois.' },
        { to: '/comptes', emoji: '👥', nom: 'Comptes', desc: 'Créer / gérer les comptes et les rôles.' },
      ],
    },
    {
      titre: 'Boutique & outils',
      outils: [
        ...(options.fidelite
          ? [{ to: '/promotions', emoji: '🎉', nom: 'Promotions', desc: 'Offres affichées sur les cartes de fidélité.' }]
          : []),
        { to: '/import', emoji: '📥', nom: 'Import', desc: 'Importer l’historique (CSV).' },
        ...(!estSuperadmin
          ? [{ to: '/support', emoji: '💬', nom: 'Support', desc: 'Écrire à l’exploitant.' }]
          : []),
      ],
    },
  ];
}

export default function Gestion() {
  const { estSuperadmin, options } = useAuth();
  return (
    <div className="page">
      <h1>Gestion</h1>
      {sections(estSuperadmin, options).map((s) => (
        <section key={s.titre} className="hub-section">
          <h2>{s.titre}</h2>
          <div className="hub-grille">
            {s.outils.map((o) => (
              <Link key={o.to} to={o.to} className="card hub-carte">
                <span className="hub-emoji">{o.emoji}</span>
                <span className="hub-nom">{o.nom}</span>
                <span className="hub-desc">{o.desc}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="hub-section">
        <h2>Personnalisation</h2>
        <LogoMagasin />
      </section>

      {/* Abonnement & options — self-service (visible aussi au superadmin pour
          gérer/tester le magasin qu'il pilote). */}
      <section className="hub-section">
        <h2>Abonnement</h2>
        <GestionOptions />
        <div className="card">
          <p className="statut">
            Gère ton moyen de paiement, retrouve tes factures ou résilie ton abonnement (portail
            sécurisé Stripe).
          </p>
          <BoutonAbonnement />
        </div>
      </section>
    </div>
  );
}
