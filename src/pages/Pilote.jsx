import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { formatDateFr } from '../lib/format';
import Messagerie from '../components/Messagerie';

// Mode pilote (super-admin) — panneau d'accueil : on choisit un magasin à
// piloter. Chaque carte porte un indicateur de messages (cliquable pour
// répondre sans entrer). Cliquer la carte ouvre le magasin avec tous les outils.
const LIBELLE_ABO = { essai: 'Essai', actif: 'Actif', suspendu: 'Suspendu' };

export default function Pilote() {
  const { utilisateur, magasinId, deconnexion } = useAuth();
  const [magasins, setMagasins] = useState([]);
  const [nonLus, setNonLus] = useState({}); // magasin_id -> nb messages non lus
  const [fil, setFil] = useState(null); // { id, nom } magasin de la messagerie ouverte
  const [msgErr, setMsgErr] = useState('');

  const charger = useCallback(async () => {
    const [{ data: mg }, { data: msg }] = await Promise.all([
      supabase
        .from('magasins')
        .select('id, nom, abonnement, essai_fin, echeance, stripe_subscription_id')
        .order('nom'),
      supabase.from('messages').select('magasin_id, de_superadmin, lu'),
    ]);
    setMagasins(mg ?? []);
    const compte = {};
    (msg ?? [])
      .filter((m) => !m.lu && !m.de_superadmin)
      .forEach((m) => {
        compte[m.magasin_id] = (compte[m.magasin_id] ?? 0) + 1;
      });
    setNonLus(compte);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  // Entrer dans un magasin : on bascule le magasin actif puis on ouvre l'app.
  async function entrer(m) {
    if (!utilisateur) return;
    await supabase.from('users').update({ magasin_id: m.id }).eq('id', utilisateur.id);
    sessionStorage.setItem('pilote:entre', '1');
    window.location.href = '/';
  }

  function fermerFil() {
    setFil(null);
    charger(); // rafraîchit les compteurs (messages marqués lus à l'ouverture)
  }

  // Facturation Stripe : ouvre le checkout (s'abonner) ou le portail (gérer).
  async function facturer(m, fn) {
    setMsgErr('');
    const { data, error } = await supabase.functions.invoke(fn, { body: { magasinId: m.id } });
    if (error) {
      // Récupère le message d'erreur renvoyé par la fonction (corps JSON).
      let detail = error.message;
      try {
        const corps = await error.context?.json?.();
        if (corps?.error) detail = corps.error;
      } catch {
        /* corps non lisible */
      }
      setMsgErr(detail || 'Action Stripe indisponible (config ?).');
      return;
    }
    if (data?.error) {
      setMsgErr(data.error);
      return;
    }
    if (data?.url) window.location.href = data.url;
  }

  // Lier un magasin à un client Stripe existant (cus_…).
  async function lierStripe(m) {
    const id = window.prompt('ID client Stripe du magasin (cus_…) :', '');
    if (id == null) return;
    await supabase.from('magasins').update({ stripe_customer_id: id.trim() || null }).eq('id', m.id);
    charger();
  }

  return (
    <div className="page-connexion pilote">
      <div className="pilote-tete">
        <span className="logo">Gestion</span>
        <h1 className="logo-connexion">🧭 Mode pilote</h1>
        <p className="statut">Choisis un magasin à piloter.</p>
      </div>

      <div className="pilote-grille">
        {magasins.map((m) => (
          <div key={m.id} className="pilote-carte">
            <button type="button" className="pilote-carte-corps" onClick={() => entrer(m)}>
              <strong>{m.nom}</strong>
              <span className={`badge ${m.abonnement === 'suspendu' ? 'badge-dette' : 'badge-solde'}`}>
                {LIBELLE_ABO[m.abonnement] ?? m.abonnement}
                {m.id === magasinId ? ' · actuel' : ''}
              </span>
            </button>
            <button
              type="button"
              className={`pilote-msg ${nonLus[m.id] ? 'a-message' : ''}`}
              onClick={() => setFil({ id: m.id, nom: m.nom })}
              title="Messages du magasin"
            >
              💬{nonLus[m.id] ? ` ${nonLus[m.id]}` : ''}
            </button>
            <div className="pilote-carte-pied">
              <span className="pilote-echeance">
                {m.abonnement === 'essai' && m.essai_fin
                  ? `Essai jusqu’au ${formatDateFr(m.essai_fin)}`
                  : m.echeance
                    ? `Renouvellement ${formatDateFr(m.echeance)}`
                    : 'Pas d’abonnement'}
              </span>
              <div className="pilote-actions">
                {m.stripe_subscription_id ? (
                  <button type="button" className="btn btn-discret" onClick={() => facturer(m, 'stripe-portal')}>
                    💳 Gérer
                  </button>
                ) : (
                  <button type="button" className="btn btn-discret" onClick={() => facturer(m, 'stripe-checkout')}>
                    S’abonner
                  </button>
                )}
                <button type="button" className="btn btn-discret" onClick={() => lierStripe(m)} title="Lier un client Stripe">
                  🔗
                </button>
              </div>
            </div>
          </div>
        ))}
        {magasins.length === 0 && <p className="vide">Aucun magasin.</p>}
      </div>

      {msgErr && <p className="message-erreur" style={{ textAlign: 'center' }}>{msgErr}</p>}

      <div className="form-inline" style={{ justifyContent: 'center' }}>
        <Link to="/magasins" className="btn">
          ⚙️ Gestion avancée
        </Link>
        <button type="button" className="btn btn-discret" onClick={deconnexion}>
          Déconnexion
        </button>
      </div>

      {fil && (
        <div className="aide-fond" role="dialog" aria-modal="true" aria-label="Messages magasin" onClick={fermerFil}>
          <div className="aide-modale" onClick={(e) => e.stopPropagation()}>
            <div className="aide-tete">
              <h2>💬 {fil.nom}</h2>
              <button type="button" className="btn btn-discret" onClick={fermerFil}>
                Fermer
              </button>
            </div>
            <Messagerie magasinId={fil.id} superadmin />
          </div>
        </div>
      )}
    </div>
  );
}
