import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { SOCLE, OPTIONS_TARIFS, PACKS, calculerMensuel } from '../lib/tarifs';
import { formatEuros } from '../lib/format';

// Écran self-service — l'admin gère son abonnement : socle « Comptoir » +
// options à la carte, ajoutées/retirées en direct sur son abonnement Stripe.
// Les PACKS (plafonds de prix) s'appliquent automatiquement : dès que toutes
// les options d'un pack sont actives, la facture est plafonnée au prix du pack
// (remise appliquée côté Stripe par l'Edge Function stripe-options).
export default function GestionOptions() {
  const { magasinId, rechargerMagasin } = useAuth();
  const [mag, setMag] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('magasins')
      .select(
        'stripe_subscription_id, gratuit, opt_planning, opt_stock, opt_fidelite, opt_livraisons, opt_compta, opt_news'
      )
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
    // Recharge l'info magasin dans l'AuthProvider → la nav et l'accès aux
    // modules s'actualisent immédiatement, sans rafraîchir l'application.
    await rechargerMagasin?.();
    setMsg(actif ? 'Option activée ✅' : 'Option retirée.');
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

  const abonne = Boolean(mag?.stripe_subscription_id);
  const actives = OPTIONS_TARIFS.filter((o) => mag?.[o.col]).map((o) => o.cle);
  const { plein, total, pack, remise } = calculerMensuel(actives);
  const premium = PACKS.find((p) => p.cle === 'premium');

  return (
    <div className="card">
      <h2>Abonnement & options</h2>
      <p className="statut">
        Socle <strong>Comptoir — {SOCLE} € HT/mois</strong> : caisse, clôtures, dettes clients,
        fiches, journal, comptes équipe. Ajoute les options quand tu veux.
      </p>

      <ul className="liste-options">
        {OPTIONS_TARIFS.map((o) => (
          <li key={o.cle} className="ligne-option">
            <span className="option-nom">
              {o.nom}
              <span className="statut option-detail">{o.detail}</span>
            </span>
            <span className="option-prix">+{o.prix} €</span>
            {abonne ? (
              <button
                type="button"
                className={`btn ${mag?.[o.col] ? 'btn-discret' : 'btn-primary'}`}
                disabled={busy === o.cle}
                onClick={() => basculer(o, !mag?.[o.col])}
              >
                {busy === o.cle ? '…' : mag?.[o.col] ? 'Retirer' : 'Ajouter'}
              </button>
            ) : (
              <span className="option-prix" title="Abonne-toi au socle pour activer">🔒</span>
            )}
          </li>
        ))}
      </ul>

      <p className="statut">
        🎁 Packs automatiques : <strong>Boutique 45 €</strong> (Stocks + Fidélité) ·{' '}
        <strong>Pro 59 €</strong> (tout sauf News IA) · <strong>Premium 69 €</strong> (tout,
        IA incluse{premium ? ` — au lieu de ${SOCLE + premium.options.reduce((s, c) => s + (OPTIONS_TARIFS.find((o) => o.cle === c)?.prix ?? 0), 0)} €` : ''}).
        Dès que les options d’un pack sont actives, le plafond s’applique tout seul.
      </p>

      {abonne ? (
        <p className="periode-info">
          Total actuel : <strong>{formatEuros(total)} HT/mois</strong>
          {pack && (
            <>
              {' '}
              · 🎁 pack <strong>{pack.nom}</strong> appliqué — {formatEuros(remise)} de remise/mois
              (au lieu de {formatEuros(plein)})
            </>
          )}
        </p>
      ) : (
        <>
          <p className="statut">
            Abonne-toi au socle pour activer les options (essai 14 jours, sans engagement).
            Abonnement annuel : 2 mois offerts · 2ᵉ magasin : −20 % (codes promo à l’étape de
            paiement).
          </p>
          <button type="button" className="btn btn-primary" onClick={sabonner}>
            S’abonner ({SOCLE} € HT/mois)
          </button>
        </>
      )}
      {msg && <p className="statut">{msg}</p>}
    </div>
  );
}
