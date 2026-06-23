import { createContext, useContext, useEffect, useState } from 'react';
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

  // Abonnement / période d'essai du magasin de l'utilisateur (pour le blocage).
  useEffect(() => {
    if (!profil?.magasin_id) {
      setMagasinInfo(null);
      return;
    }
    supabase
      .from('magasins')
      .select('abonnement, essai_fin')
      .eq('id', profil.magasin_id)
      .single()
      .then(({ data }) => setMagasinInfo(data ?? null));
  }, [profil?.magasin_id]);

  const estSuperadmin = profil?.role === 'superadmin';
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const magasinBloque =
    !estSuperadmin &&
    !!magasinInfo &&
    (magasinInfo.abonnement === 'suspendu' ||
      (magasinInfo.abonnement === 'essai' && magasinInfo.essai_fin && magasinInfo.essai_fin < aujourdHui));

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
    deconnexion: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
