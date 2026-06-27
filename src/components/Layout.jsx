import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import Aide from './Aide';
import BoutonMonnaie from './BoutonMonnaie';

const lienActif = ({ isActive }) => (isActive ? 'nav-lien actif' : 'nav-lien');

export default function Layout() {
  const { profil, estAdmin, estSuperadmin, magasins, magasinId, changerMagasin, deconnexion } =
    useAuth();

  return (
    <div className="app">
      <header className="entete">
        <div className="entete-haut">
          <span className="logo">Gestion</span>
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
          <NavLink to="/historique" className={lienActif}>
            Historique
          </NavLink>
          {estAdmin && (
            <>
              <NavLink to="/dashboard" className={lienActif}>
                Dashboard
              </NavLink>
              <NavLink to="/comptabilite" className={lienActif}>
                Comptabilité
              </NavLink>
              <NavLink to="/promotions" className={lienActif}>
                Promotions
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
              <NavLink to="/import" className={lienActif}>
                Import
              </NavLink>
            </>
          )}
          {estAdmin && !estSuperadmin && (
            <NavLink to="/support" className={lienActif}>
              Support
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
      <BoutonMonnaie />
    </div>
  );
}
