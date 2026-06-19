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
      .select('id, nom, role, pourcentage_interessement')
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

  const value = {
    session,
    utilisateur: session?.user ?? null,
    profil,
    estAdmin: profil?.role === 'admin',
    chargement,
    connexion: (email, motDePasse) =>
      supabase.auth.signInWithPassword({ email, password: motDePasse }),
    deconnexion: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
