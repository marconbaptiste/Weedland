import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

/** Bloque l'accès si non connecté. */
export function RequireAuth() {
  const { session, chargement } = useAuth();
  if (chargement) return <p className="centre">Chargement…</p>;
  if (!session) return <Navigate to="/connexion" replace />;
  return <Outlet />;
}

/** Bloque l'accès si non admin. */
export function RequireAdmin() {
  const { estAdmin, chargement } = useAuth();
  if (chargement) return <p className="centre">Chargement…</p>;
  if (!estAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}
