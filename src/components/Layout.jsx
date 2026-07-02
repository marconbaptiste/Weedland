import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import Aide from './Aide';
import Logo from './Logo';
import { urlLogo } from '../lib/logo';

const lienActif = ({ isActive }) => (isActive ? 'nav-lien actif' : 'nav-lien');

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

export default function Layout() {
  const { profil, estAdmin, estSuperadmin, magasins, magasinId, magasinLogo, changerMagasin, deconnexion } =
    useAuth();
  const logoUrl = urlLogo(magasinLogo);
  const [menu, setMenu] = useState(false); // menu burger (mobile)
  const fermer = () => setMenu(false);

  return (
    <div className="app">
      <header className="entete">
        <div className="entete-haut">
          {logoUrl ? (
            <img className="logo-magasin" src={logoUrl} alt="Logo du magasin" />
          ) : (
            <Logo />
          )}
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
            <button
              type="button"
              className={`burger ${menu ? 'actif' : ''}`}
              onClick={() => setMenu((o) => !o)}
              aria-label="Menu"
              aria-expanded={menu}
            >
              <span /><span /><span />
            </button>
          </div>
        </div>
        <nav className={`nav ${menu ? 'ouvert' : ''}`}>
          <NavLink to="/" end className={lienActif} onClick={fermer}>
            Accueil
          </NavLink>
          <NavLink to="/caisse" className={lienActif} onClick={fermer}>
            Caisse
          </NavLink>
          <NavLink to="/chromes" className={lienActif} onClick={fermer}>
            Clients
          </NavLink>
          <NavLink to="/stocks" className={lienActif} onClick={fermer}>
            Stocks
          </NavLink>
          {estAdmin && (
            <NavLink to="/gestion" className={lienActif} onClick={fermer}>
              Gestion
            </NavLink>
          )}
          {estSuperadmin && (
            <NavLink to="/magasins" className={lienActif} onClick={fermer}>
              Pilotage
            </NavLink>
          )}
          {estSuperadmin && (
            <NavLink to="/pilote" className={lienActif} onClick={fermer}>
              🧭 Magasins
            </NavLink>
          )}
        </nav>
      </header>
      <main className="contenu" onClick={fermer}>
        <Outlet />
      </main>
    </div>
  );
}
