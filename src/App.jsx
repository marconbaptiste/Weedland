import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth, RequireAdmin, RequireSuperadmin, RequireOption } from './components/Gardes';
import { useAuth } from './auth/AuthProvider';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Inscription from './pages/Inscription';
import Profil from './pages/Profil';

// Pages chargées à la demande (code-splitting) : le premier écran ne télécharge
// plus jsPDF, Tesseract, html5-qrcode… — seulement la page demandée.
const CGU = lazy(() => import('./pages/CGU'));
const Confidentialite = lazy(() => import('./pages/Confidentialite'));
const Carte = lazy(() => import('./pages/Carte'));
const RejoindreCarte = lazy(() => import('./pages/RejoindreCarte'));
const Caisse = lazy(() => import('./pages/Caisse'));
const Cloture = lazy(() => import('./pages/Cloture'));
const Historique = lazy(() => import('./pages/Historique'));
const Chromes = lazy(() => import('./pages/Chromes'));
const Commandes = lazy(() => import('./pages/Commandes'));
const Fidelite = lazy(() => import('./pages/Fidelite'));
const Stocks = lazy(() => import('./pages/Stocks'));
const Gestion = lazy(() => import('./pages/Gestion'));
const AProposMagasin = lazy(() => import('./pages/AProposMagasin'));
const Configuration = lazy(() => import('./pages/Configuration'));
const NouveauMotDePasse = lazy(() => import('./pages/NouveauMotDePasse'));
const Veille = lazy(() => import('./pages/Veille'));
const Paiements = lazy(() => import('./pages/Paiements'));
const Comptes = lazy(() => import('./pages/Comptes'));
const Promotions = lazy(() => import('./pages/Promotions'));
const Journal = lazy(() => import('./pages/Journal'));
const JournalModifs = lazy(() => import('./pages/JournalModifs'));
const Comptabilite = lazy(() => import('./pages/Comptabilite'));
const Plannings = lazy(() => import('./pages/Plannings'));
const Magasins = lazy(() => import('./pages/Magasins'));
const Pilote = lazy(() => import('./pages/Pilote'));
const Support = lazy(() => import('./pages/Support'));
const CGV = lazy(() => import('./pages/CGV'));
const MentionsLegales = lazy(() => import('./pages/MentionsLegales'));
const ConfidentialiteCarte = lazy(() => import('./pages/ConfidentialiteCarte'));
const Import = lazy(() => import('./pages/Import'));

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
    <Suspense fallback={<p className="centre">Chargement…</p>}>
    <Routes>
      <Route path="/presentation" element={<Landing />} />
      <Route path="/cgu" element={<CGU />} />
      <Route path="/confidentialite" element={<Confidentialite />} />
      <Route path="/cgv" element={<CGV />} />
      <Route path="/mentions-legales" element={<MentionsLegales />} />
      <Route path="/confidentialite-carte" element={<ConfidentialiteCarte />} />
      <Route path="/connexion" element={<Login />} />
      <Route path="/nouveau-mot-de-passe" element={<NouveauMotDePasse />} />
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
          <Route path="veille" element={<Veille />} />
          {/* Messagerie admin ↔ exploitant : réservée à l'admin (RLS alignée) */}
          <Route element={<RequireAdmin />}>
            <Route path="support" element={<Support />} />
          </Route>

          {/* Modules à option d'abonnement */}
          <Route element={<RequireOption option="stock" />}>
            <Route path="stocks" element={<Stocks />} />
          </Route>
          <Route element={<RequireOption option="fidelite" />}>
            <Route path="f/:clientId" element={<Fidelite />} />
          </Route>
          <Route element={<RequireOption option="livraisons" />}>
            <Route path="commandes" element={<Commandes />} />
          </Route>

          {/* Réservé à l'admin */}
          <Route element={<RequireAdmin />}>
            <Route path="gestion" element={<Gestion />} />
            <Route path="configuration" element={<Configuration />} />
            <Route path="a-propos-magasin" element={<AProposMagasin />} />
            <Route path="comptabilite" element={<Comptabilite />} />
            <Route path="paiements" element={<Paiements />} />
            <Route path="journal" element={<Journal />} />
            <Route path="journal-chromes" element={<JournalModifs />} />
            <Route path="comptes" element={<Comptes />} />
            <Route path="import" element={<Import />} />
            <Route element={<RequireOption option="planning" />}>
              <Route path="plannings" element={<Plannings />} />
            </Route>
            <Route element={<RequireOption option="fidelite" />}>
              <Route path="promotions" element={<Promotions />} />
            </Route>
          </Route>

          {/* Réservé au super-admin (exploitant) */}
          <Route element={<RequireSuperadmin />}>
            <Route path="magasins" element={<Magasins />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
