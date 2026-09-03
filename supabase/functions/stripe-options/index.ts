// Edge Function — stripe-options
// Ajoute / retire une option sur l'abonnement Stripe d'un magasin (une ligne
// d'abonnement par option), puis applique la REMISE PACK automatique (plafond
// de prix) via un coupon « pack-remise-<centimes> ». Réservé à l'admin /
// superadmin du magasin. Secrets : STRIPE_SECRET_KEY uniquement (produits et
// prix provisionnés par lookup_key `kanabiz_<option>`).
//
// Principes (audit facturation) :
//  - Une seule source de vérité : les LIGNES de l'abonnement Stripe. Après la
//    bascule on relit l'abonnement et on dérive TOUS les drapeaux opt_* depuis
//    ses lignes (lookup_key + anciens IDs de prix). Plus de décalage possible
//    entre Stripe et la base (ni avec le webhook, qui fait la même chose).
//  - La remise pack est calculée sur les montants RÉELS des lignes (un abonné
//    resté sur une ancienne grille n'est ni sur- ni sous-facturé), et le coupon
//    pack ne touche JAMAIS aux autres remises du client (code promo −20 %…).
//  - Un aperçu de la prochaine facture (prorata) est renvoyé pour l'afficher.
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

// ⚠️ Grille répliquée depuis src/lib/tarifs.js — garder les DEUX cohérentes.
const OPTS: Record<string, { prix: number; nom: string; ancienSecret?: string }> = {
  stock: { prix: 10, nom: "Kanabiz — Option Stocks & achats", ancienSecret: "STRIPE_PRICE_STOCK" },
  fidelite: { prix: 12, nom: "Kanabiz — Option Fidélité & promos", ancienSecret: "STRIPE_PRICE_FIDELITE" },
  livraisons: { prix: 8, nom: "Kanabiz — Option Commandes & livraisons" },
  planning: { prix: 8, nom: "Kanabiz — Option Planning & horaires", ancienSecret: "STRIPE_PRICE_PLANNING" },
  compta: { prix: 12, nom: "Kanabiz — Option Compta Pro" },
  news: { prix: 9, nom: "Kanabiz — Option News IA" },
};
const COL = (cle: string) => `opt_${cle}`;
// Packs (plafonds), du plus complet au plus simple — même table que tarifs.js.
const PACKS = [
  { options: ["stock", "fidelite", "livraisons", "planning", "compta", "news"], prix: 69 },
  { options: ["stock", "fidelite", "livraisons", "planning", "compta"], prix: 59 },
  { options: ["stock", "fidelite"], prix: 45 },
];
const PREFIXE_COUPON = "pack-remise-";
const TAX_AUTO = (Deno.env.get("STRIPE_TAX_AUTO") ?? "").trim().toLowerCase() === "on";

// Clé d'option d'un prix : lookup_key `kanabiz_<cle>`, sinon ancien ID (grille
// précédente) via les secrets STRIPE_PRICE_*, sinon null (socle / inconnu).
function cleDepuisPrix(price: Stripe.Price | null | undefined): string | null {
  if (!price) return null;
  const lk = price.lookup_key ?? "";
  if (lk.startsWith("kanabiz_")) {
    const cle = lk.slice("kanabiz_".length);
    return cle in OPTS ? cle : null;
  }
  for (const [cle, o] of Object.entries(OPTS)) {
    const id = o.ancienSecret ? Deno.env.get(o.ancienSecret)?.trim() : undefined;
    if (id && id === price.id) return cle;
  }
  return null;
}

// Remise pack (centimes) : plafond du PREMIER pack complet (le plus complet
// prime — même règle que tarifs.js) appliqué au prix RÉEL des lignes.
// `montants` = centimes réellement facturés par option active (lignes Stripe).
function remisePackCts(montants: Map<string, number>, socleCts: number): number {
  const actives = new Set(montants.keys());
  const plein = socleCts + [...montants.values()].reduce((s, m) => s + m, 0);
  for (const p of PACKS) {
    if (!p.options.every((cle) => actives.has(cle))) continue;
    const horsPack = [...actives].filter((cle) => !p.options.includes(cle));
    const candidat = p.prix * 100 + horsPack.reduce((s, cle) => s + (montants.get(cle) ?? 0), 0);
    return Math.max(0, plein - candidat);
  }
  return 0;
}

// Retrouve — ou CRÉE — le prix Stripe d'une option par lookup_key (idempotent).
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
    ...(TAX_AUTO ? { tax_behavior: "exclusive" as const } : {}), // prix HT si TVA auto
    ...(actuel && typeof actuel.product === "string"
      ? { product: actuel.product }
      : { product_data: { name: nom } }),
  });
  return cree.id;
}

// Coupon Stripe réutilisable « pack-remise-<centimes> » (créé au premier besoin).
async function couponRemise(stripe: Stripe, centimes: number): Promise<string> {
  const id = `${PREFIXE_COUPON}${centimes}`;
  try {
    await stripe.coupons.retrieve(id);
    return id;
  } catch {
    await stripe.coupons.create({
      id,
      amount_off: centimes,
      currency: "eur",
      duration: "forever",
      name: `Remise pack −${(centimes / 100).toFixed(2).replace(".", ",")} €/mois`,
    });
    return id;
  }
}

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
      .select("stripe_subscription_id, stripe_customer_id, gratuit")
      .eq("id", magasinId)
      .single();
    if (!mag) return json({ error: "Magasin inconnu" }, 404);
    if (mag.gratuit) return json({ error: "Ce magasin a déjà toutes les options (gratuit)." }, 400);
    if (!mag.stripe_subscription_id) return json({ error: "Abonne-toi d'abord au socle." }, 400);

    const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient() });
    let sub = await stripe.subscriptions.retrieve(mag.stripe_subscription_id, {
      expand: ["items.data.price", "discounts"],
    });
    if (sub.status === "canceled" || sub.status === "incomplete_expired") {
      return json({ error: "Abonnement résilié — réactive-le d'abord depuis Gestion → Abonnement." }, 400);
    }

    // 1) Bascule de la ligne d'option.
    const item = sub.items.data.find((it) => cleDepuisPrix(it.price as Stripe.Price) === option);
    if (actif && !item) {
      const priceId = await prixParCle(stripe, `kanabiz_${option}`, conf.prix * 100, conf.nom);
      await stripe.subscriptionItems.create({ subscription: sub.id, price: priceId, quantity: 1 });
    } else if (!actif && item) {
      await stripe.subscriptionItems.del(item.id);
    }

    // 2) Relecture : l'état RÉEL des lignes fait foi (drapeaux + remise).
    sub = await stripe.subscriptions.retrieve(sub.id, { expand: ["items.data.price", "discounts"] });
    const montants = new Map<string, number>(); // option → centimes réels
    let socleCts = 0;
    for (const it of sub.items.data) {
      const price = it.price as Stripe.Price;
      const cle = cleDepuisPrix(price);
      const cts = (price.unit_amount ?? 0) * (it.quantity ?? 1);
      if (cle) montants.set(cle, (montants.get(cle) ?? 0) + cts);
      else if (price.lookup_key === "kanabiz_socle" || socleCts === 0) socleCts = cts;
    }
    const patch: Record<string, boolean> = {};
    for (const cle of Object.keys(OPTS)) patch[COL(cle)] = montants.has(cle);
    await svc.from("magasins").update(patch).eq("id", magasinId);

    // 3) Remise pack : on ne touche QU'aux coupons « pack-remise-* », les autres
    //    remises du client (codes promo) sont conservées telles quelles.
    let avertissement: string | undefined;
    try {
      const remise = remisePackCts(montants, socleCts);
      const existants = (sub.discounts ?? []).filter(
        (d): d is Stripe.Discount => typeof d !== "string",
      );
      const autres = existants
        .filter((d) => !(d.coupon?.id ?? "").startsWith(PREFIXE_COUPON))
        .map((d) => ({ discount: d.id }));
      const packActuel = existants.find((d) => (d.coupon?.id ?? "").startsWith(PREFIXE_COUPON));
      const packVoulu = remise > 0 ? await couponRemise(stripe, remise) : null;
      const inchange = (packActuel?.coupon?.id ?? null) === packVoulu;
      if (!inchange) {
        const discounts = [...autres, ...(packVoulu ? [{ coupon: packVoulu }] : [])];
        // deno-lint-ignore no-explicit-any
        await stripe.subscriptions.update(sub.id, { discounts: (discounts.length ? discounts : "") as any });
      }
    } catch (e) {
      console.error("stripe-options remise pack:", e);
      avertissement =
        "Option basculée, mais la remise pack n'a pas pu être ajustée — réessaie ou contacte le support.";
    }

    // 4) Aperçu de la prochaine facture (prorata) — best-effort, informatif.
    let prochaineFacture: { montant: number; date: string | null } | undefined;
    try {
      const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      // deno-lint-ignore no-explicit-any
      const inv: any = await (stripe.invoices as any).retrieveUpcoming({ customer, subscription: sub.id });
      prochaineFacture = {
        montant: (inv.amount_due ?? inv.total ?? 0) / 100,
        date: inv.next_payment_attempt
          ? new Date(inv.next_payment_attempt * 1000).toISOString().slice(0, 10)
          : sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString().slice(0, 10)
            : null,
      };
    } catch {
      /* aperçu indisponible : pas bloquant */
    }

    return json({
      ok: true,
      options: patch,
      ...(prochaineFacture ? { prochaineFacture } : {}),
      ...(avertissement ? { avertissement } : {}),
    });
  } catch (e) {
    console.error("stripe-options error:", e);
    return json({ error: "Erreur interne." }, 500);
  }
});
