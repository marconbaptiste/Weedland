import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

// Bouton self-service — ouvre le portail de facturation Stripe du magasin de
// l'admin connecté (changer la carte, voir les factures, résilier). Le backend
// (`stripe-portal`) revérifie que l'appelant est bien admin de CE magasin, donc
// on se contente d'envoyer son magasin_id (fourni par le contexte d'auth).
export default function BoutonAbonnement({ libelle = '💳 Gérer mon abonnement', className = 'btn' }) {
  const { magasinId } = useAuth();
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');

  async function ouvrir() {
    setErreur('');
    setChargement(true);
    const { data, error } = await supabase.functions.invoke('stripe-portal', { body: { magasinId } });
    if (error) {
      let detail = error.message;
      try {
        const corps = await error.context?.json?.();
        if (corps?.error) detail = corps.error;
      } catch {
        /* corps non lisible */
      }
      setErreur(detail || 'Portail indisponible.');
      setChargement(false);
      return;
    }
    if (data?.error) {
      setErreur(data.error);
      setChargement(false);
      return;
    }
    if (data?.url) window.location.href = data.url;
    else setChargement(false);
  }

  return (
    <>
      <button type="button" className={className} onClick={ouvrir} disabled={chargement}>
        {chargement ? 'Ouverture…' : libelle}
      </button>
      {erreur && <p className="statut">{erreur}</p>}
    </>
  );
}
