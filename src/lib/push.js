import { supabase } from './supabase';

// Clé publique VAPID (sûre à exposer). Définie dans Vercel : VITE_VAPID_PUBLIC_KEY.
const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export function pushSupporte() {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(VAPID_PUBLIC)
  );
}

function base64UrlVersUint8(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Demande la permission, s'abonne au push, enregistre l'abonnement du client.
// `token` = jeton courant de la carte (fid_token), preuve de possession exigée
// côté serveur pour empêcher un tiers de lier son endpoint à la carte d'autrui.
export async function activerPush(clientId, token) {
  if (!pushSupporte()) return { ok: false, raison: 'non-supporte' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, raison: 'refuse' };
  const reg = await navigator.serviceWorker.register('/sw-push.js');
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlVersUint8(VAPID_PUBLIC),
    });
  }
  const j = sub.toJSON();
  const { error } = await supabase.rpc('push_enregistrer', {
    p_client: clientId,
    p_endpoint: sub.endpoint,
    p_p256dh: j.keys.p256dh,
    p_auth: j.keys.auth,
    p_token: token,
  });
  if (error) return { ok: false, raison: error.message };
  return { ok: true };
}

// État actuel : 'non-supporte' | 'refuse' | 'actif' | 'inactif'.
export async function etatPush() {
  if (!pushSupporte()) return 'non-supporte';
  if (Notification.permission === 'denied') return 'refuse';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw-push.js');
    const sub = reg && (await reg.pushManager.getSubscription());
    return sub ? 'actif' : 'inactif';
  } catch {
    return 'inactif';
  }
}
