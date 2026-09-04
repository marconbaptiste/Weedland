import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { exporterMagasin } from '../lib/exportMagasin';
import { OPTIONS_TARIFS } from '../lib/tarifs';
import { EDITEUR } from '../lib/marque';
import BoutonAbonnement from './BoutonAbonnement';

// Email de contact de l'exploitant, seulement s'il a été renseigné dans
// lib/marque.js (les gabarits « [email de contact] » ne s'affichent jamais).
export const EMAIL_SUPPORT = EDITEUR.email && !EDITEUR.email.startsWith('[') ? EDITEUR.email : '';

/** Écran affiché quand l'abonnement du magasin est expiré / suspendu. */
function AbonnementExpire() {
  const { estAdmin, magasinId, magasinInfo, utilisateur, deconnexion, rechargerMagasin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [statut, setStatut] = useState('');
  const [enExport, setEnExport] = useState(false);
  const [redirection, setRedirection] = useState(false);
  const [activation, setActivation] = useState(false); // retour du Checkout : synchro webhook
  // Sans abonnement Stripe en cours (essai terminé ou abonnement résilié), le
  // portail ne permet pas de repayer : on propose directement le Checkout.
  const aAbonnement = Boolean(magasinInfo?.stripe_subscription_id);

  // Retour du Checkout Stripe alors que le magasin est bloqué : le webhook pose
  // l'abonnement quelques secondes après. On relit le magasin jusqu'à ce que le
  // blocage se lève (≤ 30 s) au lieu de réafficher « S'abonner » après paiement.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const retour = params.get('abonnement');
    if (!retour) return undefined;
    let annule = false;
    (async () => {
      if (retour === 'ok') {
        setActivation(true);
        setStatut('Paiement reçu — activation de ton abonnement en cours…');
        for (let i = 0; i < 15 && !annule; i += 1) {
          await rechargerMagasin?.();
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (!annule) {
          setActivation(false);
          setStatut(
            "L'activation prend plus de temps que prévu. Clique sur « Actualiser » dans une minute ; si le blocage persiste, écris-nous ci-dessous."
          );
        }
      } else if (retour === 'annule') {
        setStatut('Paiement annulé — tu peux réessayer quand tu veux.');
      }
      if (!annule) navigate(location.pathname, { replace: true }); // nettoie l'URL
    })();
    return () => {
      annule = true;
    };
  }, [location.search, location.pathname, navigate, rechargerMagasin]);

  async function exporter() {
    setEnExport(true);
    try {
      await exporterMagasin();
    } finally {
      setEnExport(false);
    }
  }
  async function actualiser() {
    setStatut('Vérification…');
    await rechargerMagasin?.();
    setStatut('');
  }
  async function sabonner() {
    setStatut('');
    setRedirection(true);
    const { data, error } = await supabase.functions.invoke('stripe-checkout', { body: { magasinId } });
    if (data?.url) {
      window.location.href = data.url;
      return;
    }
    setRedirection(false);
    let detail = data?.error || error?.message || 'Paiement indisponible pour le moment.';
    let corps = data;
    try {
      const c = await error?.context?.json?.();
      if (c) corps = c;
      if (c?.error) detail = c.error;
    } catch {
      /* corps illisible */
    }
    if (corps?.dejaAbonne) {
      // La base était en retard sur Stripe : l'Edge Function vient de la
      // resynchroniser — on relit le magasin, ce qui lève le blocage.
      setStatut('Ton abonnement est déjà actif — réactivation de l’accès…');
      await rechargerMagasin?.();
      return;
    }
    setStatut(detail);
  }
  async function envoyer() {
    if (!message.trim()) return;
    const { error } = await supabase.from('messages').insert({
      magasin_id: magasinId,
      auteur_id: utilisateur?.id,
      de_superadmin: false,
      contenu: message.trim(),
    });
    if (error) {
      setStatut(
        `Message non envoyé (${error.message}).${EMAIL_SUPPORT ? ` Écris-nous directement : ${EMAIL_SUPPORT}` : ''}`
      );
      return;
    }
    setMessage('');
    setStatut('Message envoyé au support ✅ On te répond par la messagerie de l’app dès que l’accès est rétabli.');
  }

  return (
    <div className="page-connexion">
      <div className="card carte-connexion">
        <div style={{ fontSize: '2.5rem', textAlign: 'center' }}>{activation ? '⌛' : '⏳'}</div>
        <h1 className="logo-connexion">{activation ? 'Activation en cours' : 'Abonnement expiré'}</h1>
        <p className="statut">
          {activation
            ? 'Merci ! Ton paiement est confirmé, l’accès se rouvre automatiquement dans quelques secondes.'
            : `L’accès à ce magasin est suspendu. ${
                estAdmin
                  ? aAbonnement
                    ? 'Mets à jour ton moyen de paiement pour réactiver l’accès — tes données restent disponibles à l’export.'
                    : 'Ta période d’essai est terminée ou ton abonnement a été résilié. Abonne-toi pour retrouver l’accès — tes données sont conservées.'
                  : 'Contacte ton responsable.'
              }`}
        </p>
        {estAdmin && !activation && (
          <>
            {aAbonnement ? (
              <>
                <BoutonAbonnement libelle="💳 Mettre à jour mon paiement" className="btn btn-primary" />
                <small className="champ-aide">
                  Après avoir changé de carte, règle la facture en attente dans l’onglet « Factures » du
                  portail : l’accès se rouvre dès le paiement.
                </small>
              </>
            ) : (
              <button className="btn btn-primary" onClick={sabonner} disabled={redirection}>
                {redirection ? 'Redirection…' : '💳 S’abonner / Réactiver (29 € HT/mois)'}
              </button>
            )}
            <button className="btn" onClick={actualiser}>
              🔄 Actualiser
            </button>
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
            {EMAIL_SUPPORT && (
              <small className="champ-aide">
                Urgence ? Écris-nous à <a href={`mailto:${EMAIL_SUPPORT}`}>{EMAIL_SUPPORT}</a>.
              </small>
            )}
          </>
        )}
        {statut && <p className="statut">{statut}</p>}
        <button className="btn btn-discret" onClick={deconnexion}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

/** Écran affiché quand le profil n'a pas pu être lu (réseau / Supabase). */
function ConnexionImpossible() {
  const { erreurProfil, reessayerProfil, deconnexion } = useAuth();
  return (
    <div className="page-connexion">
      <div className="card carte-connexion">
        <div style={{ fontSize: '2.5rem', textAlign: 'center' }}>📡</div>
        <h1 className="logo-connexion">Connexion impossible</h1>
        <p className="statut">
          Impossible de joindre le serveur pour le moment ({erreurProfil}). Vérifie ta connexion
          internet puis réessaie — ton compte et tes données sont intacts.
        </p>
        <button className="btn btn-primary" onClick={reessayerProfil}>
          🔄 Réessayer
        </button>
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

/** Page affichée quand un module n'est pas inclus dans l'abonnement du magasin. */
function OptionInactive({ option }) {
  const { estAdmin } = useAuth();
  const o = OPTIONS_TARIFS.find((x) => x.cle === option);
  return (
    <div className="page">
      <div className="card">
        <h1>🔒 {o?.nom ?? 'Module'} — option non incluse</h1>
        <p className="statut">
          Ce module fait partie de l’option <strong>{o?.nom ?? option}</strong>
          {o?.prix ? ` (${o.prix} € HT/mois)` : ''}, qui n’est pas activée sur ton magasin.
          {o?.detail ? ` ${o.detail}.` : ''}
        </p>
        {estAdmin ? (
          <Link to="/gestion" className="btn btn-primary">
            Activer cette option dans Gestion → Abonnement
          </Link>
        ) : (
          <p className="statut">Demande à ton responsable de l’activer depuis Gestion → Abonnement.</p>
        )}
        <Link to="/" className="btn btn-discret">
          ← Retour à l’accueil
        </Link>
      </div>
    </div>
  );
}

/** Bloque l'accès si non connecté, ou si connecté mais non autorisé. */
export function RequireAuth() {
  const { session, profil, magasinBloque, chargement, erreurProfil } = useAuth();
  if (chargement) return <p className="centre">Chargement…</p>;
  if (!session) return <Navigate to="/presentation" replace />;
  if (!profil && erreurProfil) return <ConnexionImpossible />;
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

/** Bloque l'accès à un module dont l'option d'abonnement n'est pas active
 *  (page d'explication au lieu d'une redirection silencieuse). */
export function RequireOption({ option }) {
  const { options, chargement } = useAuth();
  if (chargement) return <p className="centre">Chargement…</p>;
  if (!options?.[option]) return <OptionInactive option={option} />;
  return <Outlet />;
}

/** Bloque l'accès si non super-admin (exploitant de la plateforme). */
export function RequireSuperadmin() {
  const { estSuperadmin, chargement } = useAuth();
  if (chargement) return <p className="centre">Chargement…</p>;
  if (!estSuperadmin) return <Navigate to="/" replace />;
  return <Outlet />;
}
