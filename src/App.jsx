import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth, RequireAdmin } from './components/Gardes';
import Layout from './components/Layout';
import Login from './pages/Login';
import Caisse from './pages/Caisse';
import Chromes from './pages/Chromes';
import Stocks from './pages/Stocks';
import Historique from './pages/Historique';
import Paiements from './pages/Paiements';
import Dashboard from './pages/Dashboard';
import Comptes from './pages/Comptes';
import Journal from './pages/Journal';
import Comptabilite from './pages/Comptabilite';
import Import from './pages/Import';

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Caisse />} />
          <Route path="chromes" element={<Chromes />} />
          <Route path="stocks" element={<Stocks />} />
          <Route path="historique" element={<Historique />} />

          {/* Réservé à l'admin */}
          <Route element={<RequireAdmin />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="comptabilite" element={<Comptabilite />} />
            <Route path="paiements" element={<Paiements />} />
            <Route path="journal" element={<Journal />} />
            <Route path="comptes" element={<Comptes />} />
            <Route path="import" element={<Import />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
