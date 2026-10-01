import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { configSupabaseOk } from './lib/supabase';
import ConfigManquante from './components/ConfigManquante';
import ErrorBoundary from './components/ErrorBoundary';
import App from './App';
import './index.css';

// Après un déploiement, un onglet resté ouvert peut demander un morceau de code
// (chunk) qui n'existe plus : on recharge une fois, au lieu d'afficher une erreur.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  const cle = 'kanabiz:rechargement';
  if (sessionStorage.getItem(cle) !== '1') {
    sessionStorage.setItem(cle, '1');
    window.location.reload();
  }
});
window.addEventListener('load', () => sessionStorage.removeItem('kanabiz:rechargement'));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {configSupabaseOk ? (
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      ) : (
        <ConfigManquante />
      )}
    </ErrorBoundary>
  </React.StrictMode>,
);
