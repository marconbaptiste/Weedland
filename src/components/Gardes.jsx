import { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { exporterMagasin } from '../lib/exportMagasin';
import BoutonAbonnement from './BoutonAbonnement';

/** Écran affiché quand l'abonnement du magasin est expiré / suspendu. */
function AbonnementExpire() {
  const { estAdmin, magasinId, utilisateur, deconnexion } = useAuth();
  const [message, setMessage] = useState('');
  const [statut, setStatut] = useState('');
  const [enExport, setEnExport] = useState(false);

  async function exporter() {
    setEnExport(true);
    try {
      await exporterMagasin();
    } finally {
      setEnExport(false);
    }
  }
  async function envoyer() {
    if (!message.trim()) return;
    await supabase.from('messages').insert({
      magasin_id: magasinId,
      auteur_id: utilisateur?.id,
      de_superadmin: false,
      contenu: message.trim(),
    });
    setMessage('');
    setStatut('Message envoyé au support ✅');
  }

  return (
    <div className="page-connexion">
      <div className="card carte-connexion">
        <div style={{ fontSize: '2.5rem', textAlign: 'center' }}>⏳</div>
        <h1 className="logo-connexion">Abonnement expiré</h1>
        <p className="statut">
          L’accès à ce magasin est suspendu. {estAdmin
            ? 'Contacte le support pour réactiver ton abonnement — tes données restent disponibles à l’export.'
            : 'Contacte ton responsable.'}
        </p>
        {estAdmin && (
          <>
            <BoutonAbonnement libelle="💳 Gérer mon abonnement" className="btn btn-primary" />
            <button className="btn" onClick={exporter} disabled={enExport}>
              {enExport ? 'Export…' : '⬇️ Exporter mes données'}
            </button>
            <label className="field">
              <span>Message au support</span>
              <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
            </label>
            <button className="btn btn-primary" onClick={envoyer}>
              Envoyer au support
            </button>
            {statut && <p className="statut">{statut}</p>}
          </>
        )}
        <button className="btn btn-discret" onClick={deconnexion}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

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
  const { session, profil, magasinBloque, chargement } = useAuth();
  if (chargement) return <p className="centre">Chargement…</p>;
  if (!session) return <Navigate to="/presentation" replace />;
  if (!profil) return <CompteNonAutorise />;
  if (magasinBloque) return <AbonnementExpire />;
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
