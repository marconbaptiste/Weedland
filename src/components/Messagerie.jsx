import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

// Fil de discussion d'un magasin (doléances admin <-> super-admin).
// `superadmin` : true côté exploitant, false côté magasin.
export default function Messagerie({ magasinId, superadmin = false }) {
  const { utilisateur } = useAuth();
  const [messages, setMessages] = useState([]);
  const [texte, setTexte] = useState('');

  const charger = useCallback(async () => {
    if (!magasinId) {
      setMessages([]);
      return;
    }
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('magasin_id', magasinId)
      .order('created_at', { ascending: true });
    const liste = data ?? [];
    setMessages(liste);
    // Marque comme lus les messages reçus de l'autre partie.
    const nonLus = liste.filter((m) => !m.lu && m.de_superadmin !== superadmin);
    if (nonLus.length) {
      await supabase.from('messages').update({ lu: true }).in('id', nonLus.map((m) => m.id));
    }
  }, [magasinId, superadmin]);

  useEffect(() => {
    charger();
    const i = setInterval(charger, 12000);
    return () => clearInterval(i);
  }, [charger]);

  async function envoyer(e) {
    e.preventDefault();
    const c = texte.trim();
    if (!c || !magasinId) return;
    await supabase.from('messages').insert({
      magasin_id: magasinId,
      auteur_id: utilisateur.id,
      de_superadmin: superadmin,
      contenu: c,
    });
    setTexte('');
    charger();
  }

  return (
    <div className="messagerie">
      <div className="messages">
        {messages.map((m) => (
          <div key={m.id} className={`bulle ${m.de_superadmin === superadmin ? 'moi' : 'autre'}`}>
            <span>{m.contenu}</span>
            <span className="bulle-quand">{new Date(m.created_at).toLocaleString('fr-FR')}</span>
          </div>
        ))}
        {messages.length === 0 && <p className="vide">Aucun message.</p>}
      </div>
      <form className="form-inline" onSubmit={envoyer}>
        <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Écrire un message…" />
        <button className="btn btn-primary" type="submit">
          Envoyer
        </button>
      </form>
    </div>
  );
}
