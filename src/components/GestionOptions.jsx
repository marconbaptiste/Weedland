import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { SOCLE, OPTIONS_TARIFS, PACKS, calculerMensuel } from '../lib/tarifs';
import { formatEuros, formatDateFr } from '../lib/format';
import BoutonAbonnement from './BoutonAbonnement';

const COLONNES =
  'stripe_subscription_id, stripe_customer_id, stripe_statut, abonnement, essai_fin, gratuit, ' +
  'opt_planning, opt_stock, opt_fidelite, opt_livraisons, opt_compta, opt_news';

// Lit le détail d'une erreur d'Edge Function (corps JSON) — sinon message brut.
async function erreurDe(error, data) {
  let detail = data?.error || error?.message || '';
  let corps = data;
  try {
    const c = await error?.context?.json?.();
    if (c) corps = c;
    if (c?.error) detail = c.error;
  } catch {
    /* corps illisible */
  }
  return { detail, corps };
}

// Écran self-service — l'admin gère son abonnement : socle « Comptoir » +
// options à la carte, ajoutées/retirées en direct sur son abonnement Stripe.
// Les PACKS (plafonds de prix) s'appliquent automatiquement côté Stripe
// (Edge Function stripe-options). Cet écran :
//  - au retour du Checkout (`?abonnement=ok`), ATTEND que le webhook ait posé
//    l'abonnement avant de réafficher quoi que ce soit (pas de 2ᵉ « S'abonner ») ;
//  - propose « Réactiver » quand l'abonnement a été résilié (customer conservé) ;
//  - affiche l'aperçu de la prochaine facture (prorata) après chaque bascule.
export default function GestionOptions() {
  const { magasinId, rechargerMagasin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mag, setMag] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [attenteRetour, setAttenteRetour] = useState(false); // retour Checkout : synchro webhook
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');
  const [facture, setFacture] = useState(null); // { montant, date } — aperçu prochaine facture
  const monte = useRef(true);

  const charger = useCallback(async () => {
    const { data } = await supabase.from('magasins').select(COLONNES).eq('id', magasinId).single();
    if (monte.current) {
      setMag(data ?? null);
      setChargement(false);
    }
    return data ?? null;
  }, [magasinId]);

  useEffect(() => {
    monte.current = true;
    charger();
    return () => {
      monte.current = false;
    };
  }, [charger]);

  // Retour du Checkout : le webhook `checkout.session.completed` pose
  // stripe_subscription_id quelques secondes après. On attend (≤ 30 s) avant
  // d'afficher l'écran, pour ne jamais réafficher « S'abonner » par erreur.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const retour = params.get('abonnement');
    if (!retour) return undefined;
    let annule = false;
    (async () => {
      if (retour === 'ok') {
        setAttenteRetour(true);
        for (let i = 0; i < 15 && !annule; i += 1) {
          const m = await charger();
          if (m?.stripe_subscription_id) break;
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (!annule) {
          setAttenteRetour(false);
          setMsg('Abonnement activé ✅ Merci !');
          await rechargerMagasin?.();
        }
      } else if (retour === 'annule') {
        setMsg('Paiement annulé — tu peux réessayer quand tu veux.');
      }
      if (!annule) navigate(location.pathname, { replace: true }); // nettoie l'URL
    })();
    return () => {
      annule = true;
    };
  }, [location.search, location.pathname, charger, navigate, rechargerMagasin]);

  async function sabonner() {
    setMsg('');
    setBusy('socle');
    const { data, error } = await supabase.functions.invoke('stripe-checkout', { body: { magasinId } });
    setBusy(null);
    if (error || data?.error) {
      const { detail, corps } = await erreurDe(error, data);
      if (corps?.dejaAbonne) {
        // La base était en retard sur Stripe : l'Edge Function l'a resynchronisée.
        await charger();
        await rechargerMagasin?.();
        setMsg('Ton abonnement est déjà actif ✅');
        return;
      }
      setMsg(`Erreur : ${detail}`);
      return;
    }
    if (data?.url) window.location.href = data.url;
  }

  async function basculer(o, actif) {
    setBusy(o.cle);
    setMsg('');
    setFacture(null);
    const { data, error } = await supabase.functions.invoke('stripe-options', {
      body: { magasinId, option: o.cle, actif },
    });
    setBusy(null);
    if (error || data?.error) {
      const { detail } = await erreurDe(error, data);
      setMsg(`Erreur : ${detail}`);
      return;
    }
    // L'Edge Function renvoie l'état RÉEL de toutes les options (source : Stripe).
    setMag((m) => ({ ...m, ...(data?.options ?? { [o.col]: actif }) }));
    if (data?.prochaineFacture) setFacture(data.prochaineFacture);
    await rechargerMagasin?.();
    setMsg(
      (actif ? 'Option activée ✅' : 'Option retirée.') +
        (data?.avertissement ? ` ${data.avertissement}` : ''),
    );
  }

  if (chargement || attenteRetour) {
    return (
      <div className="card">
        <p className="statut">
          {attenteRetour ? 'Activation de ton abonnement en cours…' : 'Chargement de l’abonnement…'}
        </p>
      </div>
    );
  }

  if (mag?.gratuit) {
    return (
      <div className="card">
        <h2>Abonnement</h2>
        <p className="statut">🎁 Toutes les options sont offertes pour ce magasin.</p>
      </div>
    );
  }

  const abonne = Boolean(mag?.stripe_subscription_id);
  const resilie = !abonne && Boolean(mag?.stripe_customer_id); // a déjà eu un abonnement
  const impaye = abonne && mag?.stripe_statut === 'past_due';
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

      {impaye && (
        <p className="statut message-erreur">
          ⚠️ Ton dernier prélèvement a échoué. Mets à jour ta carte pour éviter la suspension.
          <BoutonAbonnement libelle="💳 Mettre à jour ma carte" className="btn btn-primary btn-compact" />
        </p>
      )}

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
                disabled={busy !== null}
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
        <>
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
          <p className="statut">
            Ajouter une option en cours de mois = prorata sur ta prochaine facture ; la retirer = avoir
            au prorata (pas de remboursement immédiat).
            {facture && (
              <>
                {' '}
                Prochaine facture estimée : <strong>{formatEuros(facture.montant)}</strong>
                {facture.date ? ` le ${formatDateFr(facture.date)}` : ''}.
              </>
            )}
          </p>
        </>
      ) : (
        <>
          <p className="statut">
            {resilie
              ? 'Ton abonnement a été résilié. Tu peux le réactiver à tout moment — tes données sont conservées.'
              : `Abonne-toi au socle pour activer les options (essai gratuit jusqu'à la fin de ta période d'essai${
                  mag?.essai_fin ? `, le ${formatDateFr(mag.essai_fin)}` : ''
                }, sans engagement).`}{' '}
            Un code promo peut être saisi à l’étape de paiement.
          </p>
          <button type="button" className="btn btn-primary" onClick={sabonner} disabled={busy === 'socle'}>
            {busy === 'socle' ? 'Redirection…' : resilie ? 'Réactiver mon abonnement' : `S’abonner (${SOCLE} € HT/mois)`}
          </button>
        </>
      )}
      {msg && <p className="statut">{msg}</p>}
    </div>
  );
}
