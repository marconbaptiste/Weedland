import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { compresserLogo } from '../lib/image';
import { urlLogo } from '../lib/logo';

// Personnalisation — le patron (admin) téléverse le logo de son magasin.
// Le fichier va dans le bucket public `logos` (chemin préfixé par magasin_id,
// écriture réservée à l'admin par la RLS Storage), et le chemin est enregistré
// sur le magasin via la fonction SECURITY DEFINER `magasin_logo_set` (un admin
// ne peut pas écrire directement sur `magasins`).
export default function LogoMagasin() {
  const { magasinId, magasinLogo, setMagasinLogo } = useAuth();
  const [enCours, setEnCours] = useState(false);
  const [msg, setMsg] = useState('');

  async function surFichier(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMsg('');
    setEnCours(true);
    try {
      const blob = await compresserLogo(file);
      const chemin = `${magasinId}/${crypto.randomUUID()}.png`; // nom unique → pas de cache périmé
      const { error: up } = await supabase.storage
        .from('logos')
        .upload(chemin, blob, { contentType: 'image/png', upsert: true });
      if (up) {
        setMsg(`Envoi impossible : ${up.message}`);
        return;
      }
      const { error } = await supabase.rpc('magasin_logo_set', { p_chemin: chemin });
      if (error) {
        setMsg(`Enregistrement impossible : ${error.message}`);
        return;
      }
      // Supprime l'ancien fichier (best-effort).
      if (magasinLogo && magasinLogo !== chemin) {
        supabase.storage.from('logos').remove([magasinLogo]).catch(() => {});
      }
      setMagasinLogo(chemin);
      setMsg('Logo mis à jour ✅');
    } finally {
      setEnCours(false);
    }
  }

  async function retirer() {
    if (!window.confirm('Retirer le logo du magasin ?')) return;
    const { error } = await supabase.rpc('magasin_logo_set', { p_chemin: null });
    if (error) {
      setMsg(`Retrait impossible : ${error.message}`);
      return;
    }
    if (magasinLogo) supabase.storage.from('logos').remove([magasinLogo]).catch(() => {});
    setMagasinLogo(null);
    setMsg('Logo retiré.');
  }

  const url = urlLogo(magasinLogo);

  return (
    <div className="card">
      <h2>Logo du magasin</h2>
      <p className="statut">
        Il s’affiche dans l’en-tête de l’app et en haut des cartes de fidélité de tes clients. PNG à
        fond transparent conseillé.
      </p>
      {url && (
        <div className="apercu-logo">
          <img src={url} alt="Logo du magasin" />
        </div>
      )}
      <div className="form-inline">
        <label className="btn">
          {url ? 'Changer le logo' : 'Ajouter un logo'}
          <input type="file" accept="image/*" hidden onChange={surFichier} disabled={enCours} />
        </label>
        {url && (
          <button type="button" className="btn btn-discret" onClick={retirer} disabled={enCours}>
            Retirer
          </button>
        )}
      </div>
      {enCours && <p className="statut">Envoi…</p>}
      {msg && <p className="statut">{msg}</p>}
    </div>
  );
}
