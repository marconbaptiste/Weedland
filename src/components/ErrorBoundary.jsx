import { Component } from 'react';

// Filet de sécurité global : une erreur de rendu (bug JS, chunk manquant après
// un déploiement) affiche un écran « Recharger » au lieu d'un écran noir muet
// — et l'erreur est journalisée (console + hook `window.__kanabizErreur` si un
// outil de monitoring est branché).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null };
  }

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  componentDidCatch(erreur, info) {
    console.error('Erreur de rendu :', erreur, info?.componentStack);
    try {
      window.__kanabizErreur?.(erreur, info);
    } catch {
      /* monitoring absent */
    }
  }

  render() {
    if (!this.state.erreur) return this.props.children;
    const chunkManquant = /dynamically imported module|Loading chunk|Importing a module script failed/i.test(
      String(this.state.erreur?.message ?? ''),
    );
    return (
      <div className="page-connexion">
        <div className="card carte-connexion" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem' }}>😵</div>
          <h1 className="logo-connexion">{chunkManquant ? 'Nouvelle version disponible' : 'Oups, un problème'}</h1>
          <p className="statut">
            {chunkManquant
              ? 'L’application a été mise à jour pendant que cette page était ouverte. Recharge pour continuer — rien n’est perdu.'
              : 'Une erreur inattendue est survenue. Recharge la page ; si le problème persiste, écris au support depuis Gestion.'}
          </p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            🔄 Recharger
          </button>
        </div>
      </div>
    );
  }
}
