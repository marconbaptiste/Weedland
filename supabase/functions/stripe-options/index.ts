// Edge Function — stripe-options
// Ajoute / retire une option (planning / stock / fidélité) sur l'abonnement
// Stripe d'un magasin, en tant que ligne d'abonnement (subscription item). Met à
// jour le drapeau opt_* correspondant (le webhook le confirmera aussi).
// Réservé à l'admin/superadmin du magasin.
// Secrets : STRIPE_SECRET_KEY, STRIPE_PRICE_PLANNING, STRIPE_PRICE_STOCK,
//           STRIPE_PRICE_FIDELITE.
import Stripe from "npm:stripe@17";
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

// option → (secret du prix, colonne du drapeau)
const OPTS: Record<string, { secret: string; col: string }> = {
  planning: { secret: "STRIPE_PRICE_PLANNING", col: "opt_planning" },
  stock: { secret: "STRIPE_PRICE_STOCK", col: "opt_stock" },
  fidelite: { secret: "STRIPE_PRICE_FIDELITE", col: "opt_fidelite" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { magasinId, option, actif } = await req.json();
    const conf = OPTS[option];
    if (!magasinId || !conf) return json({ error: "Paramètres invalides." }, 400);

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

    const { data: mag } = await svc
      .from("magasins")
      .select("stripe_subscription_id, gratuit")
      .eq("id", magasinId)
      .single();
    if (!mag) return json({ error: "Magasin inconnu" }, 404);
    if (mag.gratuit) return json({ error: "Ce magasin a déjà toutes les options (gratuit)." }, 400);
    if (!mag.stripe_subscription_id) return json({ error: "Abonne-toi d'abord à l'offre de base." }, 400);

    const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
    const priceId = env(conf.secret);
    const sub = await stripe.subscriptions.retrieve(mag.stripe_subscription_id);
    const item = sub.items.data.find((it) => it.price.id === priceId);

    if (actif && !item) {
      await stripe.subscriptionItems.create({ subscription: sub.id, price: priceId, quantity: 1 });
    } else if (!actif && item) {
      await stripe.subscriptionItems.del(item.id);
    }

    // Mise à jour immédiate du drapeau (le webhook confirmera de son côté).
    await svc.from("magasins").update({ [conf.col]: !!actif }).eq("id", magasinId);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
