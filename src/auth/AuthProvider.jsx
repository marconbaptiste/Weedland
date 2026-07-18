import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

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
      setProfilPret(true);
      return undefined;
    }
    setProfilPret(false);
    supabase
      .from('users')
      .select('id, nom, role, pourcentage_interessement, magasin_id')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (actif) {
          setProfil(data ?? null);
          setProfilPret(true);
        }
      });
    return () => {
      actif = false;
    };
  }, [session]);

  // Tant que la session n'a pas été relue (ou le profil chargé), on attend :
  // évite de rediriger vers la connexion au rafraîchissement.
  const chargement = !sessionPrete || !profilPret;

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
      return;
    }
    const { data } = await supabase
      .from('magasins')
      .select('abonnement, essai_fin, logo, gratuit, stripe_subscription_id, opt_planning, opt_stock, opt_fidelite')
      .eq('id', profil.magasin_id)
      .single();
    setMagasinInfo(data ?? null);
    setMagasinLogo(data?.logo ?? null);
  }, [profil?.magasin_id]);

  useEffect(() => {
    rechargerMagasin();
  }, [rechargerMagasin]);

  const estSuperadmin = profil?.role === 'superadmin';
  // Options d'abonnement du magasin (paywall des modules). Le superadmin
  // (exploitant) n'est jamais bridé ; un magasin `gratuit` (ex. le magasin
  // originel Weedland) a toujours toutes les options, sans facturation.
  const options = estSuperadmin || magasinInfo?.gratuit
    ? { planning: true, stock: true, fidelite: true }
    : {
        planning: magasinInfo?.opt_planning ?? false,
        stock: magasinInfo?.opt_stock ?? false,
        fidelite: magasinInfo?.opt_fidelite ?? false,
      };
  // Blocage d'abonnement : c'est STRIPE qui fait autorité. On ne bloque un
  // magasin QUE s'il est réellement sur un abonnement Stripe suspendu (impayé /
  // résiliation, statut poussé par le webhook). Ainsi :
  //  - le superadmin n'est jamais bloqué ;
  //  - un magasin `gratuit` (offert, ex. Weedland) n'est jamais bloqué ;
  //  - les magasins sans abonnement Stripe (pas encore facturés, états `essai`/
  //    `suspendu` hérités de l'ancien pilotage) ne sont PLUS bloqués à tort.
  const magasinBloque =
    !estSuperadmin &&
    !!magasinInfo &&
    !magasinInfo.gratuit &&
    Boolean(magasinInfo.stripe_subscription_id) &&
    magasinInfo.abonnement === 'suspendu';

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
    magasinLogo,
    setMagasinLogo,
    rechargerMagasin,
    options,
    magasinBloque,
    changerMagasin,
    chargement,
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
