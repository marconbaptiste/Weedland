import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

// Menu Caisse — hub regroupant les outils de caisse (façon page Gestion) :
// Clôture / Historique / Tableau de bord (ce dernier réservé à l'admin).
export default function Caisse() {
  const { estAdmin } = useAuth();
  const outils = [
    {
      to: '/caisse/cloture',
      emoji: '🧾',
      nom: 'Clôture',
      desc: 'Saisir la caisse du jour (CB, espèces, chromes, heures).',
    },
    {
      to: '/caisse/historique',
      emoji: '📅',
      nom: 'Historique',
      desc: estAdmin
        ? 'Toutes les clôtures du mois, tous les employés.'
        : 'Vos clôtures passées et journées partagées.',
    },
  ];

  return (
    <div className="page">
      <h1>Caisse</h1>
      <section className="hub-section">
        <div className="hub-grille">
          {outils.map((o) => (
            <Link key={o.to} to={o.to} className="card hub-carte">
              <span className="hub-emoji">{o.emoji}</span>
              <span className="hub-nom">{o.nom}</span>
              <span className="hub-desc">{o.desc}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
