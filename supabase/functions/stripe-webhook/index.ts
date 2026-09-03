// Edge Function — stripe-webhook  (déployer avec « Verify JWT » désactivé)
// Reçoit les événements Stripe, vérifie la signature, et synchronise l'état
// d'abonnement du magasin : abonnement / essai_fin / échéance / statut brut /
// stripe_subscription_id / drapeaux opt_* (une ligne d'abonnement par option).
// Secrets : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
//
// Principes (audit facturation) :
//  - À chaque événement on RELIT l'abonnement chez Stripe (état courant) au lieu
//    de faire confiance à l'objet de l'événement : les webhooks n'arrivent pas
//    toujours dans l'ordre (un `updated(active)` retardataire ne doit pas
//    « débloquer » un abonnement résilié).
//  - Les options sont reconnues par `lookup_key` (`kanabiz_<option>`), ET par
//    les anciens IDs de prix (secrets STRIPE_PRICE_*) pour les abonnés posés
//    avec l'ancienne grille : on ne retire jamais une option payée.
//  - Résiliation (subscription.deleted / canceled) → `stripe_subscription_id`
//    remis à NULL (on garde le customer) : le magasin peut se RÉABONNER.
//  - `past_due` (1ᵉʳ échec de prélèvement) = grâce : on laisse Stripe faire ses
//    relances (Smart Retries), le statut brut est visible pour un bandeau.
//    `unpaid` / `canceled` / `incomplete_expired` / `paused` → suspendu.
//  - `checkout.session.completed` → on pose tout de suite l'id d'abonnement :
//    évite qu'un second clic « S'abonner » crée un 2ᵉ abonnement.
// Ce fichier est autonome (pas d'import partagé) pour rester déployable par
// copier-coller dans l'éditeur du Dashboard.
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (n: string) => {
  const v = Deno.env.get(n);
  if (!v) throw new Error(`Secret manquant : ${n}`);
  return v.trim();
};
const jourISO = (epoch: number | null | undefined) =>
  epoch ? new Date(epoch * 1000).toISOString().slice(0, 10) : null;

// Colonnes des options (miroir de src/lib/tarifs.js).
const OPTIONS = ["stock", "fidelite", "livraisons", "planning", "compta", "news"] as const;
const COL = (cle: string) => `opt_${cle}`;

// Clé d'option d'une ligne d'abonnement : par lookup_key, sinon par ancien ID
// de prix (grille précédente), sinon null (= le socle ou une ligne inconnue).
function cleDepuisPrix(price: Stripe.Price | null | undefined): string | null {
  if (!price) return null;
  const lk = price.lookup_key ?? "";
  if (lk.startsWith("kanabiz_")) {
    const cle = lk.slice("kanabiz_".length);
    return (OPTIONS as readonly string[]).includes(cle) ? cle : null;
  }
  const legacy: Record<string, string> = {
    planning: Deno.env.get("STRIPE_PRICE_PLANNING") ?? "",
    stock: Deno.env.get("STRIPE_PRICE_STOCK") ?? "",
    fidelite: Deno.env.get("STRIPE_PRICE_FIDELITE") ?? "",
  };
  for (const [cle, id] of Object.entries(legacy)) if (id && id.trim() === price.id) return cle;
  return null;
}

// Statut Stripe → abonnement applicatif. `null` = ne pas toucher (incomplete :
// paiement initial en cours, on n'a pas encore d'abonnement réel).
function abonnementDepuisStatut(statut: Stripe.Subscription.Status): "actif" | "essai" | "suspendu" | null {
  switch (statut) {
    case "active":
      return "actif";
    case "trialing":
      return "essai";
    case "past_due":
      return "actif"; // grâce : Stripe relance ; bandeau via stripe_statut
    case "incomplete":
      return null;
    default:
      return "suspendu"; // unpaid, canceled, incomplete_expired, paused
  }
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

  const svc = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

  try {
    // 1) Fin de Checkout : poser immédiatement l'abonnement sur le magasin.
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      const magasinId = session.metadata?.magasin_id ?? session.client_reference_id ?? undefined;
      if (subId) {
        // On passe par la synchronisation complète (statut, options…).
        await synchroniser(stripe, svc, subId, magasinId);
      }
      return new Response("ok", { status: 200 });
    }

    // 2) Cycle de vie de l'abonnement.
    if (event.type.startsWith("customer.subscription.")) {
      const obj = event.data.object as Stripe.Subscription;
      await synchroniser(stripe, svc, obj.id, obj.metadata?.magasin_id ?? undefined);
      return new Response("ok", { status: 200 });
    }
  } catch (e) {
    // 500 → Stripe réessaiera l'événement.
    console.error("stripe-webhook:", e);
    return new Response("erreur", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});

// Relit l'abonnement chez Stripe et écrit l'état courant sur le magasin.
async function synchroniser(
  stripe: Stripe,
  svc: ReturnType<typeof createClient>,
  subId: string,
  magasinIdHint?: string,
) {
  const sub = await stripe.subscriptions.retrieve(subId, { expand: ["items.data.price"] });
  const magasinId = sub.metadata?.magasin_id ?? magasinIdHint;
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  // Cible : le magasin par id (metadata), sinon par customer Stripe.
  // deno-lint-ignore no-explicit-any
  const ou = (q: any) => (magasinId ? q.eq("id", magasinId) : q.eq("stripe_customer_id", customer ?? ""));

  const termine = sub.status === "canceled" || sub.status === "incomplete_expired";

  // Options réellement présentes sur l'abonnement.
  const actives = new Set<string>();
  for (const it of sub.items?.data ?? []) {
    const cle = cleDepuisPrix(it.price as Stripe.Price);
    if (cle) actives.add(cle);
  }

  const patch: Record<string, unknown> = {
    stripe_statut: sub.status,
    echeance: jourISO(sub.current_period_end),
  };
  const ab = abonnementDepuisStatut(sub.status);
  if (ab) patch.abonnement = ab;
  if (sub.trial_end) patch.essai_fin = jourISO(sub.trial_end);

  if (termine) {
    // Résilié : plus d'abonnement courant → réabonnement possible (customer conservé).
    patch.stripe_subscription_id = null;
    for (const cle of OPTIONS) patch[COL(cle)] = false;
    // Ne pas écraser un abonnement plus récent (réabonnement déjà en place).
    const { data: actuel } = await ou(svc.from("magasins").select("stripe_subscription_id")).maybeSingle();
    if (actuel?.stripe_subscription_id && actuel.stripe_subscription_id !== sub.id) return;
    await ou(svc.from("magasins").update(patch));
    return;
  }

  patch.stripe_subscription_id = sub.id;
  for (const cle of OPTIONS) patch[COL(cle)] = actives.has(cle);
  await ou(svc.from("magasins").update(patch));
}
