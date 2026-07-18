// Edge Function — stripe-webhook  (déployer avec --no-verify-jwt)
// Reçoit les événements Stripe, vérifie la signature, et synchronise l'état
// d'abonnement du magasin (abonnement / essai_fin / échéance / statut brut).
// Secrets : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (n: string) => {
  const v = Deno.env.get(n);
  if (!v) throw new Error(`Secret manquant : ${n}`);
  return v;
};
const jourISO = (epoch: number | null | undefined) =>
  epoch ? new Date(epoch * 1000).toISOString().slice(0, 10) : null;

// Statut Stripe → abonnement applicatif (pilote le blocage existant).
function abonnementDepuisStatut(statut: string) {
  if (statut === "active") return "actif";
  if (statut === "trialing") return "essai";
  return "suspendu"; // past_due, unpaid, canceled, incomplete, incomplete_expired, paused
}

Deno.serve(async (req) => {
  const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig ?? "", env("STRIPE_WEBHOOK_SECRET"));
  } catch (e) {
    return new Response(`Signature invalide : ${(e as Error).message}`, { status: 400 });
  }

  if (event.type.startsWith("customer.subscription.")) {
    const sub = event.data.object as Stripe.Subscription;
    const statut = sub.status;
    const patch: Record<string, unknown> = {
      abonnement: abonnementDepuisStatut(statut),
      stripe_statut: statut,
      stripe_subscription_id: sub.id,
      essai_fin: jourISO(sub.trial_end),
      echeance: jourISO(sub.current_period_end),
    };

    // Options : dérive les drapeaux opt_* des lignes de l'abonnement (une ligne
    // par option payée). Ne touche un drapeau que si son prix est configuré.
    const prixOpt: Record<string, string | undefined> = {
      opt_planning: Deno.env.get("STRIPE_PRICE_PLANNING"),
      opt_stock: Deno.env.get("STRIPE_PRICE_STOCK"),
      opt_fidelite: Deno.env.get("STRIPE_PRICE_FIDELITE"),
    };
    const prixPresents = new Set((sub.items?.data ?? []).map((it) => it.price?.id));
    for (const [col, pid] of Object.entries(prixOpt)) {
      if (pid) patch[col] = prixPresents.has(pid);
    }
    const svc = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const magasinId = sub.metadata?.magasin_id;
    const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    const req2 = svc.from("magasins").update(patch);
    await (magasinId ? req2.eq("id", magasinId) : req2.eq("stripe_customer_id", customer));
  }

  return new Response("ok", { status: 200 });
});
