import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Logo from '../components/Logo';

// Page publique — définir un nouveau mot de passe après avoir cliqué sur le lien
// de réinitialisation reçu par email. Supabase établit une session « recovery »
// à l'ouverture du lien (le hash de l'URL est lu automatiquement) ; on écoute
// l'événement PASSWORD_RECOVERY, puis on appelle updateUser({ password }).
export default function NouveauMotDePasse() {
  const navigate = useNavigate();
  const [pret, setPret] = useState(false); // lien valide / session détectée
  const [mdp, setMdp] = useState('');
  const [mdp2, setMdp2] = useState('');
  const [msg, setMsg] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setPret(true);
    });
    // Session déjà présente (lien déjà consommé, ou utilisateur connecté).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPret(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    if (mdp.length < 6) {
      setErreur('Le mot de passe doit faire au moins 6 caractères.');
      return;
    }
    if (mdp !== mdp2) {
      setErreur('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setEnvoi(true);
    const { error } = await supabase.auth.updateUser({ password: mdp });
    setEnvoi(false);
    if (error) {
      console.error('updateUser (recovery):', error);
      setErreur(
        'Impossible de changer le mot de passe. Le lien a peut-être expiré — redemande un email depuis la page de connexion.',
      );
      return;
    }
    setMsg('Mot de passe mis à jour ✅ Redirection…');
    setTimeout(() => navigate('/', { replace: true }), 1200);
  }

  return (
    <div className="page-connexion">
      <form className="card carte-connexion" onSubmit={soumettre}>
        <Logo taille={40} className="marque-hero" />
        <p className="statut" style={{ marginTop: '-0.25rem' }}>Choisis un nouveau mot de passe</p>

        {!pret ? (
          <p className="statut">Ouverture du lien de réinitialisation…</p>
        ) : (
          <>
            <label className="field">
              <span>Nouveau mot de passe</span>
              <input
                type="password"
                value={mdp}
                onChange={(e) => setMdp(e.target.value)}
                autoComplete="new-password"
                required
              />
              <small className="champ-aide">6 caractères minimum.</small>
            </label>
            <label className="field">
              <span>Confirme le mot de passe</span>
              <input
                type="password"
                value={mdp2}
                onChange={(e) => setMdp2(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            {erreur && <p className="message-erreur">{erreur}</p>}
            {msg && <p className="statut">{msg}</p>}
            <button className="btn btn-primary" type="submit" disabled={envoi}>
              {envoi ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn-discret"
          onClick={() => navigate('/connexion', { replace: true })}
        >
          Retour à la connexion
        </button>
      </form>
    </div>
  );
}
