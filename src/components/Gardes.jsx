import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

/** Écran affiché à un utilisateur connecté mais sans profil (non autorisé). */
function CompteNonAutorise() {
  const { utilisateur, deconnexion } = useAuth();
  return (
    <div className="page-connexion">
      <div className="card carte-connexion">
        <h1 className="logo-connexion">Accès non autorisé</h1>
        <p className="statut">
          Le compte <strong>{utilisateur?.email}</strong> n’est pas autorisé à accéder à
          l’application. Demande à l’administrateur d’ajouter ton adresse aux comptes autorisés.
        </p>
        <button className="btn" onClick={deconnexion}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

/** Bloque l'accès si non connecté, ou si connecté mais non autorisé. */
export function RequireAuth() {
  const { session, profil, chargement } = useAuth();
  if (chargement) return <p className="centre">Chargement…</p>;
  if (!session) return <Navigate to="/presentation" replace />;
  if (!profil) return <CompteNonAutorise />;
  return <Outlet />;
}

/** Bloque l'accès si non admin. */
export function RequireAdmin() {
  const { estAdmin, chargement } = useAuth();
  if (chargement) return <p className="centre">Chargement…</p>;
  if (!estAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Bloque l'accès si non super-admin (exploitant de la plateforme). */
export function RequireSuperadmin() {
  const { estSuperadmin, chargement } = useAuth();
  if (chargement) return <p className="centre">Chargement…</p>;
  if (!estSuperadmin) return <Navigate to="/" replace />;
  return <Outlet />;
}
