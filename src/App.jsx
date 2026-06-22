import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth, RequireAdmin, RequireSuperadmin } from './components/Gardes';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import CGU from './pages/CGU';
import Confidentialite from './pages/Confidentialite';
import Login from './pages/Login';
import Inscription from './pages/Inscription';
import Carte from './pages/Carte';
import Profil from './pages/Profil';
import Caisse from './pages/Caisse';
import Chromes from './pages/Chromes';
import Fidelite from './pages/Fidelite';
import Stocks from './pages/Stocks';
import Historique from './pages/Historique';
import Paiements from './pages/Paiements';
import Dashboard from './pages/Dashboard';
import Comptes from './pages/Comptes';
import Journal from './pages/Journal';
import Comptabilite from './pages/Comptabilite';
import Magasins from './pages/Magasins';
import Import from './pages/Import';

export default function App() {
  return (
    <Routes>
      <Route path="/presentation" element={<Landing />} />
      <Route path="/cgu" element={<CGU />} />
      <Route path="/confidentialite" element={<Confidentialite />} />
      <Route path="/connexion" element={<Login />} />
      <Route path="/inscription" element={<Inscription />} />
      <Route path="/carte/:clientId" element={<Carte />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Profil />} />
          <Route path="caisse" element={<Caisse />} />
          <Route path="chromes" element={<Chromes />} />
          <Route path="stocks" element={<Stocks />} />
          <Route path="historique" element={<Historique />} />
          <Route path="f/:clientId" element={<Fidelite />} />

          {/* Réservé à l'admin */}
          <Route element={<RequireAdmin />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="comptabilite" element={<Comptabilite />} />
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
