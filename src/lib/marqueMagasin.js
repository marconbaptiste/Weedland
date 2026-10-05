// Marque blanche par magasin : applique le NOM et le LOGO du magasin à l'onglet,
// au raccourci « écran d'accueil » et au manifeste PWA — pour que l'app du
// personnel devienne « celle du magasin » (et non « Kanabiz », le nom de la
// plateforme). Restaurable (renvoie une fonction de nettoyage).

// Dessine le logo (contain, avec marge) centré sur un carré arrondi sombre →
// data URI PNG. iOS exige un apple-touch-icon carré et opaque : le SVG/manifeste
// ne suffit pas. Renvoie null si le logo n'a pas pu être chargé/dessiné (CORS…).
export function genererIconeLogo(url, taille, fond = '#14161b') {
  return new Promise((resolve) => {
    if (!url || typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = taille;
        c.height = taille;
        const ctx = c.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        const r = Math.round(taille * 0.22);
        ctx.fillStyle = fond;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.arcTo(taille, 0, taille, taille, r);
        ctx.arcTo(taille, taille, 0, taille, r);
        ctx.arcTo(0, taille, 0, 0, r);
        ctx.arcTo(0, 0, taille, 0, r);
        ctx.closePath();
        ctx.fill();
        const pad = taille * 0.16;
        const dispo = taille - pad * 2;
        const ratio = Math.min(dispo / img.width, dispo / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        ctx.drawImage(img, (taille - w) / 2, (taille - h) / 2, w, h);
        resolve(c.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Applique la marque du magasin. `nom` obligatoire ; `logoUrl` optionnel (URL
// publique du logo). Renvoie une fonction qui restaure l'état précédent.
export function appliquerMarqueMagasin({ nom, logoUrl }) {
  if (typeof document === 'undefined' || !nom) return () => {};

  const prevTitre = document.title;
  document.title = nom;

  // Libellé court iOS (nom sous l'icône de l'écran d'accueil).
  let meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  const metaCree = !meta;
  const prevMeta = meta?.getAttribute('content');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'apple-mobile-web-app-title');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', nom);

  const apple = document.querySelector('link[rel="apple-touch-icon"]');
  const prevApple = apple?.getAttribute('href');
  const lien = document.querySelector('link[rel="manifest"]');
  const prevManifest = lien?.getAttribute('href');

  let annule = false;
  const ref = { blobUrl: null };

  const appliquerIcone = (icone180, icone512) => {
    if (annule) return;
    if (apple && icone180) apple.setAttribute('href', icone180);
    if (lien) {
      const manifeste = {
        name: nom,
        short_name: nom,
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#14161b',
        theme_color: '#14161b',
        icons: [
          icone512 && { src: icone512, sizes: '512x512', type: 'image/png', purpose: 'any' },
          icone180 && { src: icone180, sizes: '180x180', type: 'image/png', purpose: 'any' },
        ].filter(Boolean),
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(manifeste)], { type: 'application/manifest+json' }),
      );
      if (ref.blobUrl) URL.revokeObjectURL(ref.blobUrl);
      ref.blobUrl = url;
      lien.setAttribute('href', url);
    }
  };

  // Si le magasin a un logo, on génère l'icône d'écran d'accueil à partir de
  // celui-ci. Sinon on garde l'icône par défaut (on ne touche qu'au nom).
  if (logoUrl) {
    Promise.all([genererIconeLogo(logoUrl, 180), genererIconeLogo(logoUrl, 512)]).then(
      ([i180, i512]) => {
        if (i180 || i512) appliquerIcone(i180, i512);
      },
    );
  }

  return () => {
    annule = true;
    document.title = prevTitre;
    if (apple && prevApple != null) apple.setAttribute('href', prevApple);
    if (lien && prevManifest != null) lien.setAttribute('href', prevManifest);
    if (ref.blobUrl) URL.revokeObjectURL(ref.blobUrl);
    if (metaCree) meta.remove();
    else if (meta && prevMeta != null) meta.setAttribute('content', prevMeta);
  };
}
