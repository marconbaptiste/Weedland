import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import Aide from './Aide';
import BandeauAbonnement from './BandeauAbonnement';
import Logo, { FeuilleKanabiz } from './Logo';
import { urlLogo } from '../lib/logo';
import { appliquerMarqueMagasin } from '../lib/marqueMagasin';

const lienActif = ({ isActive }) => (isActive ? 'nav-lien actif' : 'nav-lien');
const tabActif = ({ isActive }) => (isActive ? 'tabbar-item actif' : 'tabbar-item');

// Icône « déconnexion » (porte + flèche sortante).
function IconeDeconnexion() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// Icônes de la barre d'onglets (trait, héritent de la couleur courante).
const svgProps = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
};
const IconeAccueil = () => (
  <svg {...svgProps}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9.5 21v-6h5v6" /></svg>
);
const IconeCaisse = () => (
  <svg {...svgProps}><path d="M6 2.5h12v19l-3-1.6-3 1.6-3-1.6-3 1.6z" /><path d="M9 8h6M9 12h6" /></svg>
);
const IconeClients = () => (
  <svg {...svgProps}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.6" /><path d="M17.5 20a5.5 5.5 0 0 0-3-4.9" /></svg>
);
const IconeStocks = () => (
  <svg {...svgProps}><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5" /><path d="M12 12v9" /></svg>
);
const IconePlus = () => (
  <svg {...svgProps}><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" /></svg>
);

export default function Layout() {
  const { profil, estAdmin, estSuperadmin, magasins, magasinId, magasinNom, magasinLogo, options, changerMagasin, deconnexion } =
    useAuth();
  const logoUrl = urlLogo(magasinLogo);

  // Marque blanche : dès qu'un magasin est actif, l'onglet, le raccourci écran
  // d'accueil et le manifeste PWA prennent SON nom et SON logo (au lieu de
  // « Kanabiz »). Restauré en quittant l'app (déconnexion / page publique).
  useEffect(() => {
    if (!magasinNom) return undefined;
    return appliquerMarqueMagasin({ nom: magasinNom, logoUrl });
  }, [magasinNom, logoUrl]);

  // Destinations principales (barre d'onglets + nav ordinateur).
  const principales = [
    { to: '/', label: 'Accueil', icone: IconeAccueil, end: true },
    { to: '/caisse', label: 'Caisse', icone: IconeCaisse },
    { to: '/chromes', label: 'Clients', icone: IconeClients },
    ...(options.stock ? [{ to: '/stocks', label: 'Stocks', icone: IconeStocks }] : []),
  ];
  // Destination secondaire (admin) : Gestion — accès DIRECT depuis la barre
  // d'onglets (plus de panneau « Plus » intermédiaire). Le Pilotage vit en carte
  // dans Gestion, et le changement de magasin passe par le sélecteur d'en-tête.
  const secondaires = [...(estAdmin ? [{ to: '/gestion', label: 'Gestion' }] : [])];

  return (
    <div className="app">
      <header className="entete">
        <div className="entete-haut">
          <div className="entete-marque">
            {logoUrl ? (
              <img className="logo-magasin" src={logoUrl} alt={magasinNom || 'Logo du magasin'} />
            ) : magasinNom ? (
              <FeuilleKanabiz taille={38} />
            ) : (
              <Logo taille={32} />
            )}
            {magasinNom && <span className="entete-nom-magasin">{magasinNom}</span>}
          </div>
          <div className="entete-droite">
            {estSuperadmin && magasins.length > 0 && (
              <select
                className="select-magasin"
                value={magasinId ?? ''}
                onChange={(e) => changerMagasin(e.target.value)}
                title="Magasin actif"
              >
                {magasins.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nom}
                  </option>
                ))}
              </select>
            )}
            <span className="profil">{profil?.nom}</span>
            <Aide />
            <button
              type="button"
              className="btn-icone"
              onClick={deconnexion}
              title="Déconnexion"
              aria-label="Déconnexion"
            >
              <IconeDeconnexion />
            </button>
          </div>
        </div>
        {/* Navigation ordinateur (masquée sur mobile, remplacée par la barre d'onglets). */}
        <nav className="nav">
          {[...principales, ...secondaires].map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={lienActif}>
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="contenu">
        <BandeauAbonnement />
        <Outlet />
      </main>

      {/* Barre d'onglets (mobile uniquement) : accès au pouce, toujours visible. */}
      <nav className="tabbar" aria-label="Navigation principale">
        {principales.map(({ to, label, icone: Icone, end }) => (
          <NavLink key={to} to={to} end={end} className={tabActif}>
            <Icone />
            <span className="tab-label">{label}</span>
          </NavLink>
        ))}
        {estAdmin && (
          <NavLink to="/gestion" className={tabActif}>
            <IconePlus />
            <span className="tab-label">Gestion</span>
          </NavLink>
        )}
      </nav>
    </div>
  );
}
