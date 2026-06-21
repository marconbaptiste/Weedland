import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

// Page publique — inscription self-service d'un magasin (protégée par un code).
// Crée le magasin + le compte administrateur via l'Edge Function, puis connecte.
export default function Inscription() {
  const { connexion } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    code: '',
    nomMagasin: '',
    nom: '',
    email: '',
    motDePasse: '',
  });
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [succes, setSucces] = useState(false); // écran de félicitations

  const maj = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    setEnvoi(true);
    const { data, error } = await supabase.functions.invoke('hyper-api', {
      body: {
        action: 'inscription',
        ...form,
        code: form.code.trim(),
        email: form.email.trim().toLowerCase(),
      },
    });
    if (error || data?.error) {
      let message = data?.error ?? 'Inscription impossible.';
      try {
        const corps = await error?.context?.json();
        if (corps?.error) message = corps.error;
      } catch {
        /* message générique */
      }
      setErreur(message);
      setEnvoi(false);
      return;
    }
    // Compte créé : on connecte directement, puis on affiche les félicitations.
    const { error: errCo } = await connexion(form.email.trim().toLowerCase(), form.motDePasse);
    setEnvoi(false);
    if (errCo) {
      navigate('/connexion', { replace: true });
      return;
    }
    setSucces(true);
  }

  if (succes) {
    return (
      <div className="page-connexion">
        <div className="card carte-connexion" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem' }}>🎉</div>
          <h1 className="logo-connexion">Félicitations&nbsp;!</h1>
          <p className="statut">
            Le magasin <strong>{form.nomMagasin.trim()}</strong> est créé. Bienvenue
            {form.nom.trim() ? `, ${form.nom.trim()}` : ''}&nbsp;! Tu es l’administrateur de ta
            boutique — tu peux dès maintenant ajouter tes employés, tes clients et tes stocks.
          </p>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => navigate('/', { replace: true })}
          >
            Accéder à mon magasin
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-connexion">
      <form className="card carte-connexion" onSubmit={soumettre}>
        <h1 className="logo-connexion">Créer mon magasin</h1>
        <p className="statut">
          Renseigne les informations de ta boutique. Un code d’inscription est nécessaire (fourni
          par l’exploitant).
        </p>
        <label className="field">
          <span>Code d’inscription</span>
          <input
            value={form.code}
            onChange={maj('code')}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </label>
        <label className="field">
          <span>Nom du magasin</span>
          <input value={form.nomMagasin} onChange={maj('nomMagasin')} required />
        </label>
        <label className="field">
          <span>Ton nom</span>
          <input value={form.nom} onChange={maj('nom')} required />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" value={form.email} onChange={maj('email')} autoComplete="username" required />
        </label>
        <label className="field">
          <span>Mot de passe (8 caractères min.)</span>
          <input
            type="password"
            value={form.motDePasse}
            onChange={maj('motDePasse')}
            autoComplete="new-password"
            required
          />
        </label>
        {erreur && <p className="message-erreur">{erreur}</p>}
        <button className="btn btn-primary" type="submit" disabled={envoi}>
          {envoi ? 'Création…' : 'Créer mon magasin'}
        </button>
        <Link to="/connexion" className="statut" style={{ textAlign: 'center' }}>
          J’ai déjà un compte — me connecter
        </Link>
      </form>
    </div>
  );
}
