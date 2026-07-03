// Edge Function — envoyer-push
// Envoie une notification Web Push aux porteurs de carte d'un magasin (promo) ou
// à un client précis (objet oublié…). Réservé à l'admin/superadmin du magasin.
// Secrets : VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (ex. mailto:contact@…).
import webpush from "npm:web-push@3";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const env = (n: string) => {
  const v = Deno.env.get(n);
  if (!v) throw new Error(`Secret manquant : ${n}`);
  return v;
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { magasinId, titre, corps, url, clientId } = await req.json();
    if (!magasinId || !titre) return json({ error: "magasinId et titre requis" }, 400);

    const svc = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const auth = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userData } = await auth.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Non authentifié" }, 401);
    const { data: profil } = await svc.from("users").select("role, magasin_id").eq("id", user.id).single();
    const autorise =
      profil?.role === "superadmin" || (profil?.role === "admin" && profil?.magasin_id === magasinId);
    if (!autorise) return json({ error: "Non autorisé" }, 403);

    webpush.setVapidDetails(env("VAPID_SUBJECT"), env("VAPID_PUBLIC"), env("VAPID_PRIVATE"));

    let q = svc.from("push_abonnements").select("id, endpoint, p256dh, auth").eq("magasin_id", magasinId);
    if (clientId) q = q.eq("client_id", clientId);
    const { data: subs } = await q;

    const payload = JSON.stringify({
      titre,
      corps: corps ?? "",
      url: url ?? "/",
      icon: "/carte-icone.svg",
    });

    let envoyes = 0;
    let purges = 0;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        envoyes += 1;
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        // 404/410 = abonnement expiré → on le purge.
        if (code === 404 || code === 410) {
          await svc.from("push_abonnements").delete().eq("id", s.id);
          purges += 1;
        }
      }
    }
    return json({ envoyes, purges, total: (subs ?? []).length });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
