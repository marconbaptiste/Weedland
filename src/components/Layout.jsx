import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

const lienActif = ({ isActive }) => (isActive ? 'nav-lien actif' : 'nav-lien');

export default function Layout() {
  const { profil, estAdmin, deconnexion } = useAuth();

  return (
    <div className="app">
      <header className="entete">
        <div className="entete-haut">
          <span className="logo">🌿 Weedland</span>
          <div className="entete-droite">
            <span className="profil">{profil?.nom}</span>
            <button className="btn btn-discret" onClick={deconnexion}>
              Déconnexion
            </button>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end className={lienActif}>
            Caisse
          </NavLink>
          <NavLink to="/chromes" className={lienActif}>
            Chromes
          </NavLink>
          <NavLink to="/historique" className={lienActif}>
            Historique
          </NavLink>
          {estAdmin && (
            <>
              <NavLink to="/dashboard" className={lienActif}>
                Dashboard
              </NavLink>
              <NavLink to="/paiements" className={lienActif}>
                Paiements
              </NavLink>
              <NavLink to="/journal" className={lienActif}>
                Journal
              </NavLink>
              <NavLink to="/comptes" className={lienActif}>
                Comptes
              </NavLink>
            </>
          )}
        </nav>
      </header>
      <main className="contenu">
        <Outlet />
      </main>
    </div>
  );
}
