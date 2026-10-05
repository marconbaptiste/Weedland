import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { VERSION_LEGAL } from '../lib/marque';
import { messageErreur } from '../lib/erreurs';

// Clé PUBLIQUE Cloudflare Turnstile (anti-robots), optionnelle. Si elle est
// définie, le widget s'affiche et le jeton est transmis à Supabase Auth, qui le
// vérifie côté serveur (Dashboard → Authentication → Bot protection).
const TURNSTILE = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();

// Page publique — inscription OUVERTE d'un magasin.
// Flux (preuve de possession de l'email = la confirmation Supabase Auth) :
//  1. auth.signUp(email, mot de passe, métadonnées {nom, nomMagasin, cgvVersion})
//     → Supabase envoie l'email de confirmation (SMTP : voir SUPABASE_EMAILS.md).
//  2. Le commerçant clique le lien → revient connecté → AuthProvider ne trouve
//     pas de profil et appelle l'action `creer-magasin` (Edge Function, JWT +
//     email confirmé) qui crée magasin + profil admin → l'app s'ouvre.
// Anti-abus : confirmation email obligatoire, limites de débit Supabase Auth,
// captcha optionnel, 1 magasin par email, plafond global quotidien côté serveur.
export default function Inscription() {
  const [form, setForm] = useState({ nomMagasin: '', nom: '', email: '', motDePasse: '' });
  const [cgv, setCgv] = useState(false); // acceptation explicite (non pré-cochée)
  const [captcha, setCaptcha] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false); // écran « vérifie ta boîte mail »
  const widget = useRef(null);

  const maj = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));

  // Widget Turnstile (chargé seulement si une clé est configurée).
  useEffect(() => {
    if (!TURNSTILE || !widget.current) return undefined;
    let rendu = null;
    const monter = () => {
      if (!window.turnstile || !widget.current || rendu) return;
      rendu = window.turnstile.render(widget.current, {
        sitekey: TURNSTILE,
        theme: 'dark',
        callback: (token) => setCaptcha(token),
        'expired-callback': () => setCaptcha(''),
      });
    };
    if (window.turnstile) {
      monter();
    } else if (!document.getElementById('turnstile-js')) {
      const s = document.createElement('script');
      s.id = 'turnstile-js';
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = monter;
      document.head.appendChild(s);
    } else {
      document.getElementById('turnstile-js').addEventListener('load', monter);
    }
    return () => {
      try {
        if (rendu) window.turnstile?.remove(rendu);
      } catch {
        /* widget déjà retiré */
      }
    };
  }, []);

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    if (!cgv) {
      setErreur('Merci d’accepter les CGV, les CGU et la politique de confidentialité pour continuer.');
      return;
    }
    if (form.motDePasse.length < 8) {
      setErreur('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    if (TURNSTILE && !captcha) {
      setErreur('Merci de valider la vérification anti-robots.');
      return;
    }
    setEnvoi(true);
    const email = form.email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: form.motDePasse,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        ...(captcha ? { captchaToken: captcha } : {}),
        data: {
          nom: form.nom.trim().slice(0, 80),
          nomMagasin: form.nomMagasin.trim().slice(0, 80),
          cgvVersion: VERSION_LEGAL,
        },
      },
    });
    setEnvoi(false);
    if (error) {
      setErreur(
        /rate limit|too many/i.test(error.message)
          ? 'Trop de tentatives, réessaie dans quelques minutes.'
          : /password/i.test(error.message)
            ? 'Mot de passe refusé : choisis-en un plus long ou plus varié.'
            : messageErreur(error, 'Inscription impossible pour le moment. Réessaie.'),
      );
      return;
    }
    // Session immédiate = « Confirm email » désactivé côté Supabase : le magasin
    // se crée à l'arrivée sur l'app (AuthProvider). Sinon : email envoyé.
    if (data?.session) {
      window.location.assign('/');
      return;
    }
    setEnvoye(true);
  }

  if (envoye) {
    return (
      <div className="page-connexion">
        <div className="card carte-connexion" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem' }}>📬</div>
          <h1 className="logo-connexion">Vérifie ta boîte mail</h1>
          <p className="statut">
            Un email de confirmation vient d’être envoyé à <strong>{form.email.trim()}</strong>. Clique
            sur le lien qu’il contient : ton magasin <strong>{form.nomMagasin.trim()}</strong> sera créé et
            tu arriveras directement dans l’application (essai gratuit 14 jours).
          </p>
          <p className="statut" style={{ fontSize: '0.85rem' }}>
            Rien reçu après quelques minutes ? Regarde dans les indésirables. Si cette adresse a déjà
            un compte, <Link to="/connexion">connecte-toi</Link> simplement.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-connexion">
      <form className="card carte-connexion" onSubmit={soumettre}>
        <h1 className="logo-connexion">Créer mon magasin</h1>
        <p className="statut">
          14 jours d’essai gratuit, toutes les options, sans carte bancaire. Tu confirmes ton email,
          et c’est parti.
        </p>
        <label className="field">
          <span>Nom du magasin</span>
          <input value={form.nomMagasin} onChange={maj('nomMagasin')} required maxLength={80} />
        </label>
        <label className="field">
          <span>Ton nom</span>
          <input value={form.nom} onChange={maj('nom')} required maxLength={80} />
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
            minLength={8}
            required
          />
        </label>
        {TURNSTILE && <div ref={widget} style={{ margin: '0.5rem auto' }} />}
        {erreur && <p className="message-erreur">{erreur}</p>}
        <label className="case-consent">
          <input type="checkbox" checked={cgv} onChange={(e) => setCgv(e.target.checked)} required />
          <span>
            J’ai lu et j’accepte les <Link to="/cgv" target="_blank">CGV</Link>, les{' '}
            <Link to="/cgu" target="_blank">CGU</Link> et la{' '}
            <Link to="/confidentialite" target="_blank">politique de confidentialité</Link> (version
            du {VERSION_LEGAL}).
          </span>
        </label>
        <button className="btn btn-primary" type="submit" disabled={envoi}>
          {envoi ? 'Envoi…' : 'Créer mon magasin'}
        </button>
        <Link to="/connexion" className="statut" style={{ textAlign: 'center' }}>
          J’ai déjà un compte — me connecter
        </Link>
      </form>
    </div>
  );
}
