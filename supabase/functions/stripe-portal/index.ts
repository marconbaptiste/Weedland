// Edge Function — stripe-portal
// Ouvre le portail de facturation Stripe (gérer paiement / annuler) d'un magasin
// et renvoie l'URL. Appelé par le superadmin ou l'admin du magasin.
// Secrets : STRIPE_SECRET_KEY, APP_PUBLIC_URL.
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
    const session = await stripe.billingPortal.sessions.create({
      customer: mag.stripe_customer_id,
      return_url: `${env("APP_PUBLIC_URL")}/`,
    });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
