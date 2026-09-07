/* Service worker — notifications push de la carte de fidélité.
   Reçoit un message push (envoyé par l'Edge Function `envoyer-push`) et affiche
   une notification ; au clic, ouvre/replace au premier plan la carte du client. */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { titre: 'Notification', corps: event.data ? event.data.text() : '' };
  }
  const titre = data.titre || 'Notification';
  const options = {
    body: data.corps || '',
    icon: data.icon || '/carte-icone.svg',
    badge: '/carte-icone.svg',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(titre, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((liste) => {
      for (const c of liste) {
        if (c.url.includes(url) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
