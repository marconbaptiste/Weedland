import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

// Hub d'administration (regroupe les anciens liens du menu admin en une seule
// entrée « Gestion » → grille de cartes, plus court et ergonomique sur mobile).
function sections(estSuperadmin) {
  return [
    {
      titre: 'Chiffres & pilotage',
      outils: [
        { to: '/comptabilite', emoji: '📈', nom: 'Comptabilité', desc: 'CA, bénéfice, intéressement/heures par employé, exports CSV/PDF.' },
        { to: '/journal', emoji: '🧾', nom: 'Journal', desc: 'Flux d’activité récent.' },
      ],
    },
    {
      titre: 'Équipe',
      outils: [
        { to: '/paiements', emoji: '💸', nom: 'Paiements', desc: 'Payes des employés du mois.' },
        { to: '/comptes', emoji: '👥', nom: 'Comptes', desc: 'Créer / gérer les comptes et les rôles.' },
      ],
    },
    {
      titre: 'Boutique & outils',
      outils: [
        { to: '/promotions', emoji: '🎉', nom: 'Promotions', desc: 'Offres affichées sur les cartes de fidélité.' },
        { to: '/import', emoji: '📥', nom: 'Import', desc: 'Importer l’historique (CSV).' },
        ...(!estSuperadmin
          ? [{ to: '/support', emoji: '💬', nom: 'Support', desc: 'Écrire à l’exploitant.' }]
          : []),
      ],
    },
  ];
}

export default function Gestion() {
  const { estSuperadmin } = useAuth();
  return (
    <div className="page">
      <h1>Gestion</h1>
      {sections(estSuperadmin).map((s) => (
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
    </div>
  );
}
