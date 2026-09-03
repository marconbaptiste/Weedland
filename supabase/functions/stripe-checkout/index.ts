// Edge Function — stripe-checkout
// Crée une session Stripe Checkout (abonnement au socle « Comptoir » 29 €) pour
// un magasin et renvoie l'URL de paiement. Appelé par le superadmin ou l'admin
// du magasin. Secrets : STRIPE_SECRET_KEY, APP_PUBLIC_URL (+ optionnel
// STRIPE_TAX_AUTO=on). Le prix du socle est provisionné par lookup_key.
//
// Principes (audit facturation) :
//  - Refuse un magasin `gratuit` (offert) et un magasin qui a DÉJÀ un abonnement
//    en cours (évite un 2ᵉ abonnement au retour du Checkout).
//  - Le customer Stripe porte l'EMAIL de l'admin : Stripe peut envoyer reçus,
//    rappel de fin d'essai et relances d'impayé.
//  - Pas de double essai : l'essai Stripe se cale sur `essai_fin` du magasin
//    (période d'essai commencée à l'inscription). Un magasin qui a déjà eu un
//    abonnement (réactivation) n'a pas de nouvel essai.
//  - Adresse de facturation toujours collectée (mentions de facture). TVA :
//    calcul automatique + n° de TVA client SEULEMENT si STRIPE_TAX_AUTO=on
//    (à activer quand le régime de TVA est tranché ; Stripe Tax doit alors
//    être enregistré pour la France dans le Dashboard).
// Ce fichier est autonome (déployable par copier-coller dans le Dashboard).
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

// Prix du socle : 29 € HT/mois (grille src/lib/tarifs.js — garder cohérent).
const SOCLE_CTS = 2900;
const SOCLE_CLE = "kanabiz_socle";
const ESSAI_JOURS = 14;
const TAX_AUTO = (Deno.env.get("STRIPE_TAX_AUTO") ?? "").trim().toLowerCase() === "on";

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
    ...(TAX_AUTO ? { tax_behavior: "exclusive" as const } : {}),
    ...(actuel && typeof actuel.product === "string"
      ? { product: actuel.product }
      : { product_data: { name: nom } }),
  });
  return cree.id;
}

const EN_COURS = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);

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
      .select("id, nom, gratuit, essai_fin, stripe_customer_id, stripe_subscription_id")
      .eq("id", magasinId)
      .single();
    if (!mag) return json({ error: "Magasin inconnu" }, 404);
    if (mag.gratuit) return json({ error: "Ce magasin est offert : aucun abonnement à souscrire." }, 400);

    const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });

    // Email de facturation = email de l'admin qui souscrit (superadmin : celui du
    // 1ᵉʳ admin du magasin, à défaut le sien).
    let emailFacturation = user.email ?? undefined;
    if (profil?.role === "superadmin") {
      const { data: adm } = await svc
        .from("users")
        .select("email")
        .eq("magasin_id", magasinId)
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();
      if (adm?.email) emailFacturation = adm.email;
    }

    let customerId = mag.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: mag.nom,
        email: emailFacturation,
        metadata: { magasin_id: mag.id },
      });
      customerId = customer.id;
      await svc.from("magasins").update({ stripe_customer_id: customerId }).eq("id", mag.id);
    } else if (emailFacturation) {
      const c = await stripe.customers.retrieve(customerId);
      if (!("deleted" in c) && !c.email) await stripe.customers.update(customerId, { email: emailFacturation });
    }

    // Déjà abonné ? (garde anti-double abonnement, même si la base est en retard)
    const existantes = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
    const enCours = existantes.data.find((s) => EN_COURS.has(s.status));
    if (enCours) {
      if (mag.stripe_subscription_id !== enCours.id) {
        await svc.from("magasins").update({ stripe_subscription_id: enCours.id }).eq("id", mag.id);
      }
      return json({ error: "Ce magasin a déjà un abonnement en cours.", dejaAbonne: true }, 409);
    }
    const dejaEuUnAbonnement = existantes.data.length > 0;

    // Essai : calé sur la période d'essai du magasin (pas de double essai) ;
    // aucun essai pour une réactivation.
    let essai: { trial_end: number } | { trial_period_days: number } | Record<string, never> = {};
    if (!dejaEuUnAbonnement) {
      if (mag.essai_fin) {
        const finMs = new Date(`${mag.essai_fin}T23:59:59Z`).getTime();
        const minMs = Date.now() + 2 * 24 * 3600 * 1000; // Stripe : ≥ 48 h dans le futur
        if (finMs > minMs) essai = { trial_end: Math.floor(finMs / 1000) };
      } else {
        essai = { trial_period_days: ESSAI_JOURS };
      }
    }

    const base = env("APP_PUBLIC_URL");
    const prixSocle = await prixParCle(stripe, SOCLE_CLE, SOCLE_CTS, "Kanabiz — Socle Comptoir");
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: mag.id,
      metadata: { magasin_id: mag.id },
      line_items: [{ price: prixSocle, quantity: 1 }],
      subscription_data: { ...essai, metadata: { magasin_id: mag.id } },
      allow_promotion_codes: true, // codes promo saisis à l'étape de paiement
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      ...(TAX_AUTO ? { automatic_tax: { enabled: true }, tax_id_collection: { enabled: true } } : {}),
      success_url: `${base}/gestion?abonnement=ok`,
      cancel_url: `${base}/gestion?abonnement=annule`,
    });
    return json({ url: session.url, essai: "trial_end" in essai || "trial_period_days" in essai });
  } catch (e) {
    console.error("stripe-checkout error:", e);
    return json({ error: "Erreur interne." }, 500);
  }
});
