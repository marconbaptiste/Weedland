import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

// Composer admin — envoie une notification push (gratuite) à tous les clients du
// magasin qui ont ajouté leur carte et accepté les notifications.
export default function NotifierClients() {
  const { magasinId } = useAuth();
  const [titre, setTitre] = useState('');
  const [corps, setCorps] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [msg, setMsg] = useState('');

  async function envoyer(e) {
    e.preventDefault();
    if (!titre.trim()) return;
    setEnvoi(true);
    setMsg('');
    const { data, error } = await supabase.functions.invoke('envoyer-push', {
      body: { magasinId, titre: titre.trim(), corps: corps.trim() },
    });
    setEnvoi(false);
    if (error || data?.error) {
      let detail = data?.error || error?.message;
      try {
        const c = await error?.context?.json?.();
        if (c?.error) detail = c.error;
      } catch {
        /* corps illisible */
      }
      setMsg(`Erreur : ${detail || 'envoi impossible'}`);
      return;
    }
    setMsg(
      `Envoyé à ${data.envoyes} carte(s)${data.purges ? ` · ${data.purges} expirée(s) nettoyée(s)` : ''}.`,
    );
    setTitre('');
    setCorps('');
  }

  return (
    <div className="card">
      <h2>🔔 Notifier les porteurs de carte</h2>
      <p className="statut">
        Notification gratuite envoyée aux clients ayant ajouté leur carte à leur écran d’accueil et
        accepté les notifications.
      </p>
      <form onSubmit={envoyer}>
        <label className="field">
          <span>Titre</span>
          <input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            maxLength={60}
            placeholder="ex. Promo du week-end 🌿"
          />
        </label>
        <label className="field">
          <span>Message</span>
          <textarea
            rows={3}
            value={corps}
            onChange={(e) => setCorps(e.target.value)}
            maxLength={160}
            placeholder="ex. -15% sur l’Amnesia du 5 au 8 juillet !"
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={envoi}>
          {envoi ? 'Envoi…' : 'Envoyer la notification'}
        </button>
      </form>
      {msg && <p className="statut">{msg}</p>}
    </div>
  );
}
