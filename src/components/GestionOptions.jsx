import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

const OPTIONS = [
  { cle: 'planning', col: 'opt_planning', nom: '📅 Emploi du temps', prix: 5 },
  { cle: 'stock', col: 'opt_stock', nom: '📦 Gestion de stock', prix: 10 },
  { cle: 'fidelite', col: 'opt_fidelite', nom: '🎟️ Programme de fidélité', prix: 20 },
];
const BASE = 49;

// Écran self-service — l'admin gère son abonnement : offre de base 49 € HT +
// options à la carte, ajoutées/retirées en direct sur son abonnement Stripe.
export default function GestionOptions() {
  const { magasinId } = useAuth();
  const [mag, setMag] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('magasins')
      .select('stripe_subscription_id, gratuit, opt_planning, opt_stock, opt_fidelite')
      .eq('id', magasinId)
      .single();
    setMag(data ?? null);
    setChargement(false);
  }, [magasinId]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function erreurDe(error, data) {
    let detail = data?.error || error?.message || '';
    try {
      const c = await error?.context?.json?.();
      if (c?.error) detail = c.error;
    } catch {
      /* corps illisible */
    }
    return detail;
  }

  async function sabonner() {
    setMsg('');
    const { data, error } = await supabase.functions.invoke('stripe-checkout', { body: { magasinId } });
    if (error || data?.error) {
      setMsg(`Erreur : ${await erreurDe(error, data)}`);
      return;
    }
    if (data?.url) window.location.href = data.url;
  }

  async function basculer(o, actif) {
    setBusy(o.cle);
    setMsg('');
    const { data, error } = await supabase.functions.invoke('stripe-options', {
      body: { magasinId, option: o.cle, actif },
    });
    setBusy(null);
    if (error || data?.error) {
      setMsg(`Erreur : ${await erreurDe(error, data)}`);
      return;
    }
    setMag((m) => ({ ...m, [o.col]: actif }));
  }

  if (chargement) return <div className="card"><p className="statut">Chargement de l’abonnement…</p></div>;

  if (mag?.gratuit) {
    return (
      <div className="card">
        <h2>Abonnement</h2>
        <p className="statut">🎁 Toutes les options sont offertes pour ce magasin.</p>
      </div>
    );
  }

  const total = BASE + OPTIONS.filter((o) => mag?.[o.col]).reduce((s, o) => s + o.prix, 0);

  return (
    <div className="card">
      <h2>Abonnement & options</h2>
      <p className="statut">Offre de base <strong>{BASE} € HT/mois</strong>. Ajoute les options quand tu veux.</p>

      {!mag?.stripe_subscription_id ? (
        <>
          <p className="statut">Abonne-toi à l’offre de base pour activer des options (essai 14 jours, sans engagement).</p>
          <button type="button" className="btn btn-primary" onClick={sabonner}>S’abonner (49 € HT/mois)</button>
        </>
      ) : (
        <>
          <ul className="liste-options">
            {OPTIONS.map((o) => (
              <li key={o.cle} className="ligne-option">
                <span className="option-nom">{o.nom}</span>
                <span className="option-prix">+{o.prix} €</span>
                <button
                  type="button"
                  className={`btn ${mag?.[o.col] ? 'btn-discret' : 'btn-primary'}`}
                  disabled={busy === o.cle}
                  onClick={() => basculer(o, !mag?.[o.col])}
                >
                  {busy === o.cle ? '…' : mag?.[o.col] ? 'Retirer' : 'Ajouter'}
                </button>
              </li>
            ))}
          </ul>
          <p className="periode-info">Total actuel : <strong>{total} € HT/mois</strong></p>
        </>
      )}
      {msg && <p className="statut">{msg}</p>}
    </div>
  );
}
