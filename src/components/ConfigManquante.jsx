// Affiché quand les variables d'environnement Supabase ne sont pas définies,
// pour éviter un écran blanc silencieux (cas typique d'un déploiement Vercel
// sans variables configurées).
export default function ConfigManquante() {
  return (
    <div className="page-connexion">
      <div className="card carte-connexion">
        <h1 className="logo-connexion">Gestion</h1>
        <p>Configuration Supabase manquante.</p>
        <p className="statut">
          Définissez <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code>,
          puis relancez le build.
        </p>
        <p className="statut">
          En local : copiez <code>.env.example</code> en <code>.env</code>. Sur Vercel :
          Settings → Environment Variables, puis redéployez.
        </p>
      </div>
    </div>
  );
}
