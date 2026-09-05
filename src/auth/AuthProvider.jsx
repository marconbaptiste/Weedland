import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { aujourdhuiISO } from '../lib/dates';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}

/**
 * Fournit la session Supabase, le profil applicatif (nom + rôle) et les
 * actions de connexion/déconnexion à toute l'application.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [sessionPrete, setSessionPrete] = useState(false); // getSession() a répondu
  const [profil, setProfil] = useState(null);
  const [profilPret, setProfilPret] = useState(false);
  const [erreurProfil, setErreurProfil] = useState(''); // lecture du profil en échec (réseau)
  const [tentative, setTentative] = useState(0); // relance manuelle du chargement
  const [magasinPret, setMagasinPret] = useState(false); // magasinInfo lu au moins une fois
  const [magasins, setMagasins] = useState([]); // liste (super-admin uniquement)
  const [magasinInfo, setMagasinInfo] = useState(null); // abonnement du magasin courant
  const [magasinLogo, setMagasinLogo] = useState(null); // chemin du logo (bucket public)

  // Suivi de la session Supabase (persistée ~30 j et rafraîchie automatiquement).
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionPrete(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setSessionPrete(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Chargement du profil (rôle) dès qu'on a une session.
  useEffect(() => {
    let actif = true;
    if (!session?.user) {
      setProfil(null);
      setErreurProfil('');
      setProfilPret(true);
      return undefined;
    }
    setProfilPret(false);
    (async () => {
      const lire = () =>
        supabase
          .from('users')
          .select('id, nom, role, pourcentage_interessement, magasin_id, actif')
          .eq('id', session.user.id)
          .maybeSingle();
      let { data, error } = await lire();
      // Pas de profil : peut-être un compte (ex. Google) dont l'email vient
      // d'être autorisé — `reclamer_profil()` le crée si l'allowlist le permet.
      if (!error && !data) {
        const { data: ok } = await supabase.rpc('reclamer_profil');
        if (ok === true) ({ data, error } = await lire());
      }
      // Inscription publique : le compte vient de confirmer son email et porte
      // le nom du magasin choisi à l'inscription → on crée magasin + profil admin
      // (Edge Function `creer-magasin`, qui revérifie l'email confirmé).
      const u = session.user;
      if (!error && !data && u.user_metadata?.nomMagasin && (u.email_confirmed_at || u.confirmed_at)) {
        const { data: r } = await supabase.functions.invoke('creer-employe', { body: { action: 'creer-magasin' } });
        if (r?.ok) ({ data, error } = await lire());
      }
      if (!actif) return;
      // Une ERREUR de lecture (réseau, Supabase indisponible) n'est pas « pas de
      // profil » : on l'affiche comme telle au lieu de « Accès non autorisé ».
      setErreurProfil(error ? error.message || 'Connexion impossible' : '');
      // Compte désactivé par l'admin (offboarding) : traité comme « pas de profil »
      // (la RLS refuse déjà tout côté serveur via est_membre()).
      setProfil(data && data.actif !== false ? data : null);
      setProfilPret(true);
    })();
    return () => {
      actif = false;
    };
  }, [session, tentative]);

  // Tant que la session n'a pas été relue (ou le profil chargé), on attend :
  // évite de rediriger vers la connexion au rafraîchissement.
  // `magasinPret` évite qu'un F5 sur /stocks (option) renvoie à l'accueil parce
  // que les options n'étaient pas encore lues (RequireOption).
  const chargement = !sessionPrete || !profilPret || (!!profil?.magasin_id && !magasinPret);

  // Liste des magasins (pour le sélecteur du super-admin).
  useEffect(() => {
    if (profil?.role !== 'superadmin') {
      setMagasins([]);
      return;
    }
    supabase
      .from('magasins')
      .select('id, nom')
      .order('nom')
      .then(({ data }) => setMagasins(data ?? []));
  }, [profil?.role]);

  // Abonnement / options / période d'essai du magasin courant. Extrait en
  // callback pour pouvoir le rappeler à la volée (ex. après un changement
  // d'option, afin que la nav et l'accès aux modules se mettent à jour sans
  // rechargement manuel de l'app).
  const rechargerMagasin = useCallback(async () => {
    if (!profil?.magasin_id) {
      setMagasinInfo(null);
      setMagasinLogo(null);
      setMagasinPret(true);
      return;
    }
    const { data, error } = await supabase
      .from('magasins')
      .select(
        'nom, abonnement, essai_fin, logo, gratuit, stripe_subscription_id, stripe_statut, opt_planning, opt_stock, opt_fidelite, opt_livraisons, opt_compta, opt_news, import_whatsapp'
      )
      .eq('id', profil.magasin_id)
      .maybeSingle();
    // En cas d'erreur de lecture, on garde la dernière valeur connue (ne pas
    // faire disparaître les modules ni bloquer le magasin sur une coupure).
    if (!error) {
      setMagasinInfo(data ?? null);
      setMagasinLogo(data?.logo ?? null);
    }
    setMagasinPret(true);
  }, [profil?.magasin_id]);

  useEffect(() => {
    setMagasinPret(false);
    rechargerMagasin();
  }, [rechargerMagasin]);

  const estSuperadmin = profil?.role === 'superadmin';
  const aujourdHui = aujourdhuiISO(); // date LOCALE (pas UTC : cohérent avec le bandeau)
  const essaiDepasse =
    magasinInfo?.abonnement === 'essai' && !!magasinInfo?.essai_fin && magasinInfo.essai_fin < aujourdHui;
  // Période d'essai « app » (14 j posés à l'inscription, pas encore d'abonnement
  // Stripe) : TOUTES les options sont ouvertes pour que le commerçant teste le
  // produit complet, comme promis sur la landing. Dès l'abonnement, le webhook
  // Stripe redérive les `opt_*` depuis les lignes réellement payées.
  const enEssai =
    !!magasinInfo && !magasinInfo.stripe_subscription_id && magasinInfo.abonnement === 'essai' && !essaiDepasse;
  // Options d'abonnement du magasin (paywall des modules). Le superadmin
  // (exploitant) n'est jamais bridé ; un magasin `gratuit` (ex. le magasin
  // originel Weedland) a toujours toutes les options, sans facturation.
  // `whatsapp` (import des clôtures WhatsApp) n'est PAS une option commerciale :
  // c'est un drapeau propre à un magasin (`magasins.import_whatsapp`, posé par le
  // superadmin) — il suit le magasin actif, quel que soit le rôle.
  const whatsapp = magasinInfo?.import_whatsapp ?? false;
  const options = estSuperadmin || magasinInfo?.gratuit || enEssai
    ? { planning: true, stock: true, fidelite: true, livraisons: true, compta: true, news: true, whatsapp }
    : {
        planning: magasinInfo?.opt_planning ?? false,
        stock: magasinInfo?.opt_stock ?? false,
        fidelite: magasinInfo?.opt_fidelite ?? false,
        livraisons: magasinInfo?.opt_livraisons ?? false,
        compta: magasinInfo?.opt_compta ?? false,
        news: magasinInfo?.opt_news ?? false,
        whatsapp,
      };
  // Blocage d'abonnement (règle commerciale) :
  //  - jamais pour le superadmin ni pour un magasin `gratuit` (offert, ex. Weedland) ;
  //  - magasin AVEC abonnement Stripe : bloqué seulement si `suspendu` (impayé
  //    confirmé / résiliation — statut poussé par le webhook ; `past_due` = grâce) ;
  //  - magasin SANS abonnement Stripe : bloqué si suspendu manuellement (pilotage)
  //    ou si sa période d'essai (`essai_fin`, posée à l'inscription) est dépassée
  //    → il doit s'abonner. Un bandeau le prévient 3 jours avant (Layout).
  const magasinBloque =
    !estSuperadmin &&
    !!magasinInfo &&
    !magasinInfo.gratuit &&
    (magasinInfo.stripe_subscription_id
      ? magasinInfo.abonnement === 'suspendu'
      : magasinInfo.abonnement === 'suspendu' || essaiDepasse);

  // Super-admin : bascule le magasin actif (met à jour son propre magasin_id).
  // Un rechargement garantit que toutes les pages relisent le bon magasin.
  const changerMagasin = async (magasinId) => {
    if (!session?.user || !magasinId) return;
    await supabase.from('users').update({ magasin_id: magasinId }).eq('id', session.user.id);
    window.location.reload();
  };

  const value = {
    session,
    utilisateur: session?.user ?? null,
    profil,
    estAdmin: profil?.role === 'admin' || profil?.role === 'superadmin',
    estSuperadmin,
    magasins,
    magasinId: profil?.magasin_id ?? null,
    magasinInfo,
    magasinNom: magasinInfo?.nom ?? null,
    magasinLogo,
    setMagasinLogo,
    rechargerMagasin,
    options,
    magasinBloque,
    changerMagasin,
    chargement,
    erreurProfil,
    reessayerProfil: () => setTentative((n) => n + 1),
    connexion: (email, motDePasse) =>
      supabase.auth.signInWithPassword({ email, password: motDePasse }),
    connexionGoogle: () =>
      supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      }),
    deconnexion: () => {
      sessionStorage.removeItem('pilote:entre');
      return supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
