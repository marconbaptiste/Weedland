import { useState } from 'react';
import { Link } from 'react-router-dom';
import { exporterMagasin } from '../lib/exportMagasin';
import { useAuth } from '../auth/AuthProvider';
import BoutonAbonnement from '../components/BoutonAbonnement';
import GestionOptions from '../components/GestionOptions';

// Hub d'administration (regroupe les anciens liens du menu admin en une seule
// entrée « Gestion » → grille de cartes, plus court et ergonomique sur mobile).
function sections(estSuperadmin, options) {
  return [
    {
      titre: 'Chiffres & pilotage',
      outils: [
        ...(estSuperadmin
          ? [{ to: '/magasins', emoji: '🏬', nom: 'Pilotage', desc: 'Magasins, abonnements, codes d’inscription et messages.' }]
          : []),
        { to: '/comptabilite', emoji: '📈', nom: 'Comptabilité', desc: 'CA, bénéfice, intéressement/heures par employé, exports CSV/PDF.' },
        { to: '/journal', emoji: '🧾', nom: 'Journal', desc: 'Activité du comptoir : clôtures de caisse et chromes.' },
        { to: '/journal-chromes', emoji: '📒', nom: 'Journal chromes', desc: 'Modifications des chromes : qui, quand, quoi.' },
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
        { to: '/configuration', emoji: '🧭', nom: 'Assistant de configuration', desc: 'Mettre en place le magasin pas à pas.' },
        { to: '/veille', emoji: '📰', nom: 'News', desc: 'Nouveautés légales, produits & fournisseurs CBD — une longueur d’avance.' },
        { to: '/a-propos-magasin', emoji: '🏪', nom: 'À propos du magasin', desc: 'Logo, adresse, téléphone et horaires — sur la carte de fidélité.' },
        ...(options.fidelite
          ? [{ to: '/promotions', emoji: '🎉', nom: 'Promotions', desc: 'Offres affichées sur les cartes de fidélité.' }]
          : []),
        { to: '/import', emoji: '📥', nom: 'Import', desc: 'Importer l’historique (CSV).' },
        ...(!estSuperadmin
          ? [{ to: '/support', emoji: '💬', nom: 'Faire une doléance', desc: 'Un souci, une idée ? Écris-nous — réponse dans la messagerie.' }]
          : []),
      ],
    },
  ];
}

export default function Gestion() {
  const { estSuperadmin, options } = useAuth();
  const [enExport, setEnExport] = useState(false);
  async function exporter() {
    setEnExport(true);
    try {
      await exporterMagasin();
    } finally {
      setEnExport(false);
    }
  }
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
        <div className="card">
          <p className="statut">
            Tes données t’appartiennent : télécharge à tout moment une copie complète (JSON) de ton
            magasin — clients, caisse, chromes, stocks, compta, équipe.
          </p>
          <button type="button" className="btn" onClick={exporter} disabled={enExport}>
            {enExport ? 'Export…' : '⬇️ Exporter mes données'}
          </button>
        </div>
      </section>

      <footer className="landing-pied">
        <nav className="landing-liens">
          <Link to="/cgv">CGV</Link>
          <Link to="/cgu">CGU</Link>
          <Link to="/confidentialite">Confidentialité</Link>
          <Link to="/mentions-legales">Mentions légales</Link>
        </nav>
      </footer>
    </div>
  );
}
