import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth, RequireAdmin, RequireSuperadmin } from './components/Gardes';
import { useAuth } from './auth/AuthProvider';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import CGU from './pages/CGU';
import Confidentialite from './pages/Confidentialite';
import Login from './pages/Login';
import Inscription from './pages/Inscription';
import Carte from './pages/Carte';
import RejoindreCarte from './pages/RejoindreCarte';
import Profil from './pages/Profil';
import Caisse from './pages/Caisse';
import Cloture from './pages/Cloture';
import Historique from './pages/Historique';
import Chromes from './pages/Chromes';
import Fidelite from './pages/Fidelite';
import Stocks from './pages/Stocks';
import Gestion from './pages/Gestion';
import Paiements from './pages/Paiements';
import Dashboard from './pages/Dashboard';
import Comptes from './pages/Comptes';
import Promotions from './pages/Promotions';
import Journal from './pages/Journal';
import Comptabilite from './pages/Comptabilite';
import Magasins from './pages/Magasins';
import Pilote from './pages/Pilote';
import Support from './pages/Support';
import Import from './pages/Import';

// Accueil (route index) : le super-admin atterrit sur le panneau pilote tant
// qu'il n'a pas choisi de magasin pour cette session ; sinon vue normale.
function Accueil() {
  const { estSuperadmin } = useAuth();
  if (estSuperadmin && sessionStorage.getItem('pilote:entre') !== '1') {
    return <Navigate to="/pilote" replace />;
  }
  return <Profil />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/presentation" element={<Landing />} />
      <Route path="/cgu" element={<CGU />} />
      <Route path="/confidentialite" element={<Confidentialite />} />
      <Route path="/connexion" element={<Login />} />
      <Route path="/inscription" element={<Inscription />} />
      <Route path="/carte/:clientId" element={<Carte />} />
      <Route path="/rejoindre/:magasinId" element={<RejoindreCarte />} />

      <Route element={<RequireAuth />}>
        {/* Panneau pilote (super-admin) — hors Layout, plein écran */}
        <Route element={<RequireSuperadmin />}>
          <Route path="/pilote" element={<Pilote />} />
        </Route>

        <Route element={<Layout />}>
          <Route index element={<Accueil />} />
          <Route path="caisse" element={<Caisse />} />
          <Route path="caisse/cloture" element={<Cloture />} />
          <Route path="caisse/historique" element={<Historique />} />
          <Route path="chromes" element={<Chromes />} />
          <Route path="stocks" element={<Stocks />} />
          <Route path="support" element={<Support />} />
          <Route path="f/:clientId" element={<Fidelite />} />

          {/* Réservé à l'admin */}
          <Route element={<RequireAdmin />}>
            <Route path="gestion" element={<Gestion />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="comptabilite" element={<Comptabilite />} />
            <Route path="promotions" element={<Promotions />} />
            <Route path="paiements" element={<Paiements />} />
            <Route path="journal" element={<Journal />} />
            <Route path="comptes" element={<Comptes />} />
            <Route path="import" element={<Import />} />
          </Route>

          {/* Réservé au super-admin (exploitant) */}
          <Route element={<RequireSuperadmin />}>
            <Route path="magasins" element={<Magasins />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
