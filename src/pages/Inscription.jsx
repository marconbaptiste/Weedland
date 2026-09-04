import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { VERSION_LEGAL } from '../lib/marque';

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
  const [cgv, setCgv] = useState(false); // acceptation explicite (non pré-cochée)
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [succes, setSucces] = useState(false); // écran de félicitations

  const maj = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    if (!cgv) {
      setErreur('Merci d’accepter les CGV, les CGU et la politique de confidentialité pour continuer.');
      return;
    }
    setEnvoi(true);
    const { data, error } = await supabase.functions.invoke('creer-employe', {
      body: {
        action: 'inscription',
        ...form,
        code: form.code.trim(),
        email: form.email.trim().toLowerCase(),
        cgv: true,
        cgvVersion: VERSION_LEGAL,
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
    if (data?.compteExistant) {
      // Cet email a déjà un compte Supabase (ex. connexion Google) : le magasin
      // est créé et l'email autorisé ; le profil se crée à la connexion.
      setEnvoi(false);
      navigate('/connexion', {
        replace: true,
        state: {
          info:
            'Ton magasin est créé ! Cet email avait déjà un compte : connecte-toi comme d’habitude (Google ou mot de passe existant) pour y accéder.',
        },
      });
      return;
    }
    // Compte créé : on connecte directement, puis on affiche les félicitations.
    const { error: errCo } = await connexion(form.email.trim().toLowerCase(), form.motDePasse);
    setEnvoi(false);
    if (errCo) {
      navigate('/connexion', {
        replace: true,
        state: { info: 'Ton magasin est créé ! Connecte-toi avec l’email et le mot de passe choisis.' },
      });
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
            {form.nom.trim() ? `, ${form.nom.trim()}` : ''}&nbsp;! On te guide maintenant pas à pas
            pour tout mettre en place (infos du magasin, équipe, comptabilité, produits).
          </p>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => navigate('/configuration', { replace: true })}
          >
            🧭 Configurer mon magasin
          </button>
          <button
            className="btn btn-discret"
            type="button"
            onClick={() => navigate('/', { replace: true })}
          >
            Passer, j’explore d’abord
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
          <small className="champ-aide">
            Pas de code ? Demande-le à la personne qui t’a proposé l’application (l’exploitant).
          </small>
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
        <label className="case-consent">
          <input type="checkbox" checked={cgv} onChange={(e) => setCgv(e.target.checked)} required />
          <span>
            J’ai lu et j’accepte les <Link to="/cgv" target="_blank">CGV</Link>, les{' '}
            <Link to="/cgu" target="_blank">CGU</Link> et la{' '}
            <Link to="/confidentialite" target="_blank">politique de confidentialité</Link> (version
            du {VERSION_LEGAL}). Essai gratuit 14 jours, sans carte bancaire.
          </span>
        </label>
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
