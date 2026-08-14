// Edge Function — stripe-checkout
// Crée une session Stripe Checkout (abonnement au socle « Comptoir » 29 €,
// essai 14 jours) pour un magasin et renvoie l'URL de paiement. Appelé par le
// superadmin ou l'admin du magasin.
// Secrets : STRIPE_SECRET_KEY, APP_PUBLIC_URL. AUCUN produit/prix à créer dans
// le Dashboard : le prix du socle est provisionné automatiquement par
// lookup_key (`kanabiz_socle`), comme les options dans stripe-options.
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

// Prix du socle : 29 € HT/mois (grille src/lib/tarifs.js — garder cohérent).
const SOCLE_CTS = 2900;
const SOCLE_CLE = "kanabiz_socle";

// Retrouve — ou CRÉE — le prix Stripe par lookup_key. Idempotent : au premier
// appel le produit + prix sont créés dans Stripe, ensuite ils sont retrouvés.
// Si le montant de la grille change, un nouveau prix est créé et récupère la
// lookup_key (transfer_lookup_key) sans toucher les abonnés existants.
async function prixParCle(stripe: Stripe, cle: string, montantCts: number, nom: string): Promise<string> {
  const l = await stripe.prices.list({ lookup_keys: [cle], limit: 1 });
  const actuel = l.data[0];
  if (actuel && actuel.active && actuel.unit_amount === montantCts) return actuel.id;
  const cree = await stripe.prices.create({
    lookup_key: cle,
    transfer_lookup_key: true,
    unit_amount: montantCts,
    currency: "eur",
    recurring: { interval: "month" },
    ...(actuel && typeof actuel.product === "string"
      ? { product: actuel.product }
      : { product_data: { name: nom } }),
  });
  return cree.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { magasinId } = await req.json();
    if (!magasinId) return json({ error: "magasinId requis" }, 400);

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
      .select("id, nom, stripe_customer_id")
      .eq("id", magasinId)
      .single();
    if (!mag) return json({ error: "Magasin inconnu" }, 404);

    const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });

    let customerId = mag.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ name: mag.nom, metadata: { magasin_id: mag.id } });
      customerId = customer.id;
      await svc.from("magasins").update({ stripe_customer_id: customerId }).eq("id", mag.id);
    }

    const base = env("APP_PUBLIC_URL");
    const prixSocle = await prixParCle(stripe, SOCLE_CLE, SOCLE_CTS, "Kanabiz — Socle Comptoir");
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: prixSocle, quantity: 1 }],
      subscription_data: { trial_period_days: 14, metadata: { magasin_id: mag.id } },
      allow_promotion_codes: true, // le client peut entrer un code promo (ex. premier magasin)
      success_url: `${base}/?abonnement=ok`,
      cancel_url: `${base}/?abonnement=annule`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error("stripe-checkout error:", e);
    return json({ error: "Erreur interne." }, 500);
  }
});
