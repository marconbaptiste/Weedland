import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import Aide from './Aide';
import Logo from './Logo';

const lienActif = ({ isActive }) => (isActive ? 'nav-lien actif' : 'nav-lien');

export default function Layout() {
  const { profil, estAdmin, estSuperadmin, magasins, magasinId, changerMagasin, deconnexion } =
    useAuth();

  return (
    <div className="app">
      <header className="entete">
        <div className="entete-haut">
          <Logo />
          <div className="entete-droite">
            {estSuperadmin && (
              <NavLink to="/pilote" className="btn btn-discret" title="Panneau pilote">
                🧭 Magasins
              </NavLink>
            )}
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
            <button className="btn btn-discret" onClick={deconnexion}>
              Déconnexion
            </button>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end className={lienActif}>
            Accueil
          </NavLink>
          <NavLink to="/caisse" className={lienActif}>
            Caisse
          </NavLink>
          <NavLink to="/chromes" className={lienActif}>
            Clients
          </NavLink>
          <NavLink to="/stocks" className={lienActif}>
            Stocks
          </NavLink>
          {estAdmin && (
            <NavLink to="/gestion" className={lienActif}>
              Gestion
            </NavLink>
          )}
          {estSuperadmin && (
            <NavLink to="/magasins" className={lienActif}>
              Pilotage
            </NavLink>
          )}
        </nav>
      </header>
      <main className="contenu">
        <Outlet />
      </main>
    </div>
  );
}
