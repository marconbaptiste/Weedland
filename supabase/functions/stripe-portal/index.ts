// Edge Function — stripe-portal
// Ouvre le portail de facturation Stripe d'un magasin (moyen de paiement,
// factures, résiliation) et renvoie l'URL. Appelé par le superadmin ou l'admin
// du magasin. Secrets : STRIPE_SECRET_KEY, APP_PUBLIC_URL.
//
// Le portail utilise une CONFIGURATION explicite créée par code (et réutilisée)
// plutôt que le réglage par défaut du Dashboard : factures ✅, moyen de
// paiement ✅, résiliation en FIN de période ✅ (jamais immédiate), et PAS de
// changement d'offre dans le portail (les options se gèrent dans l'app, pour
// que la remise pack reste juste). Autonome (copier-coller Dashboard).
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const env = (n: string) => {
  const v = Deno.env.get(n);
  if (!v) throw new Error(`Secret manquant : ${n}`);
  return v.trim();
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MARQUEUR = "kanabiz-portail-v1";

// Retrouve (par metadata) ou crée la configuration du portail.
async function configurationPortail(stripe: Stripe): Promise<string> {
  const liste = await stripe.billingPortal.configurations.list({ limit: 100, active: true });
  const existante = liste.data.find((c) => c.metadata?.kanabiz === MARQUEUR);
  if (existante) return existante.id;
  const cree = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Kanabiz — gestion de votre abonnement" },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "address", "name", "tax_id"] },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none",
        cancellation_reason: {
          enabled: true,
          options: ["too_expensive", "missing_features", "switched_service", "unused", "other"],
        },
      },
      subscription_update: { enabled: false },
    },
    metadata: { kanabiz: MARQUEUR },
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
      .select("stripe_customer_id")
      .eq("id", magasinId)
      .single();
    if (!mag?.stripe_customer_id) return json({ error: "Aucun abonnement Stripe pour ce magasin." }, 400);

    const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
    const configuration = await configurationPortail(stripe);
    const session = await stripe.billingPortal.sessions.create({
      customer: mag.stripe_customer_id,
      configuration,
      return_url: `${env("APP_PUBLIC_URL")}/gestion`,
    });
    return json({ url: session.url });
  } catch (e) {
    console.error("stripe-portal error:", e);
    return json({ error: "Erreur interne." }, 500);
  }
});
