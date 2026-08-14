// Edge Function — stripe-options
// Ajoute / retire une option sur l'abonnement Stripe d'un magasin, en tant que
// ligne d'abonnement (subscription item), met à jour le drapeau opt_*
// correspondant, puis applique la REMISE PACK automatique (plafond de prix) :
// dès que toutes les options d'un pack sont actives, un coupon Stripe
// « pack-remise-<centimes> » (créé à la volée, réutilisé ensuite) ramène la
// facture au prix du pack. Réservé à l'admin/superadmin du magasin.
// Secrets : STRIPE_SECRET_KEY, STRIPE_PRICE_PLANNING, STRIPE_PRICE_STOCK,
//           STRIPE_PRICE_FIDELITE, STRIPE_PRICE_LIVRAISONS, STRIPE_PRICE_COMPTA,
//           STRIPE_PRICE_NEWS.
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

// option → (secret du prix Stripe, colonne du drapeau, prix HT/mois).
// ⚠️ Grille répliquée depuis src/lib/tarifs.js — garder les DEUX cohérentes.
const OPTS: Record<string, { secret: string; col: string; prix: number }> = {
  stock: { secret: "STRIPE_PRICE_STOCK", col: "opt_stock", prix: 10 },
  fidelite: { secret: "STRIPE_PRICE_FIDELITE", col: "opt_fidelite", prix: 12 },
  livraisons: { secret: "STRIPE_PRICE_LIVRAISONS", col: "opt_livraisons", prix: 8 },
  planning: { secret: "STRIPE_PRICE_PLANNING", col: "opt_planning", prix: 8 },
  compta: { secret: "STRIPE_PRICE_COMPTA", col: "opt_compta", prix: 12 },
  news: { secret: "STRIPE_PRICE_NEWS", col: "opt_news", prix: 9 },
};
const SOCLE = 29;
// Packs (plafonds), du plus complet au plus simple — même table que tarifs.js.
const PACKS = [
  { options: ["stock", "fidelite", "livraisons", "planning", "compta", "news"], prix: 69 },
  { options: ["stock", "fidelite", "livraisons", "planning", "compta"], prix: 59 },
  { options: ["stock", "fidelite"], prix: 45 },
];

// Remise pack (en €) pour un ensemble d'options actives : c'est le PREMIER pack
// applicable (le plus complet) qui s'applique — même règle que tarifs.js.
function remisePack(actives: Set<string>): number {
  const plein = SOCLE + [...actives].reduce((s, cle) => s + (OPTS[cle]?.prix ?? 0), 0);
  let total = plein;
  for (const p of PACKS) {
    if (!p.options.every((cle) => actives.has(cle))) continue;
    const horsPack = [...actives].filter((cle) => !p.options.includes(cle));
    const candidat = p.prix + horsPack.reduce((s, cle) => s + (OPTS[cle]?.prix ?? 0), 0);
    if (candidat < plein) total = candidat;
    break;
  }
  return plein - total;
}

// Coupon Stripe réutilisable « pack-remise-<centimes> » (créé au premier besoin).
async function couponRemise(stripe: Stripe, centimes: number): Promise<string> {
  const id = `pack-remise-${centimes}`;
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
      .select(
        "stripe_subscription_id, gratuit, opt_planning, opt_stock, opt_fidelite, opt_livraisons, opt_compta, opt_news"
      )
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

    // Remise pack automatique (plafond) sur l'ensemble d'options APRÈS bascule.
    // Best-effort : si Stripe refuse le coupon, la bascule d'option reste faite
    // (on renvoie un avertissement plutôt que d'échouer toute l'opération).
    let avertissement: string | undefined;
    try {
      const actives = new Set(
        Object.keys(OPTS).filter((cle) => (cle === option ? !!actif : !!mag[OPTS[cle].col as keyof typeof mag]))
      );
      const remise = remisePack(actives);
      if (remise > 0) {
        const coupon = await couponRemise(stripe, Math.round(remise * 100));
        await stripe.subscriptions.update(sub.id, { discounts: [{ coupon }] });
      } else {
        // Plus de pack complet → retirer une éventuelle remise résiduelle.
        if (sub.discounts && sub.discounts.length > 0) {
          await stripe.subscriptions.deleteDiscount(sub.id);
        }
      }
    } catch (e) {
      console.error("stripe-options remise pack:", e);
      avertissement = "Option basculée, mais la remise pack n'a pas pu être ajustée — réessaie ou contacte le support.";
    }

    return json({ ok: true, ...(avertissement ? { avertissement } : {}) });
  } catch (e) {
    console.error("stripe-options error:", e);
    return json({ error: "Erreur interne." }, 500);
  }
});
