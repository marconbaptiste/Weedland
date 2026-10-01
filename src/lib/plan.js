// Lien vers l'app de cartes pour une adresse : ouvre Plans sur iPhone/iPad et
// Google Maps ailleurs (Android, ordinateur). Un simple clic sur l'adresse lance
// l'itinéraire/la recherche dans l'app native quand elle est installée.
export function urlPlan(adresse) {
  const q = encodeURIComponent((adresse ?? '').trim());
  if (!q) return null;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const iOS =
    /iphone|ipad|ipod/i.test(ua) ||
    // iPad récent se présente comme un Mac tactile.
    (/Mac/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
  return iOS
    ? `https://maps.apple.com/?q=${q}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`;
}
