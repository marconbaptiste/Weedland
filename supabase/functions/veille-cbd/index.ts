// ============================================================================
// Edge Function — veille-cbd
// ----------------------------------------------------------------------------
// Veille réglementaire CBD 100 % automatique :
//   1) récupère des actualités via des flux RSS Google Actualités (gratuit),
//   2) les fait trier + résumer par l'IA (Claude) en un bulletin FR structuré,
//   3) enregistre le bulletin dans la table `veille` (partagée par tous les
//      magasins). L'app l'affiche avec un bandeau « informations indicatives ».
//
// Déclenchement :
//   - AUTOMATIQUE : une tâche planifiée (cron) appelle cette fonction avec
//     l'en-tête `x-cron-secret: <VEILLE_CRON_SECRET>` (cf. SUPABASE_VEILLE.md).
//   - MANUEL : un admin/superadmin connecté peut la lancer depuis l'app
//     (bouton « Générer maintenant » → JWT vérifié ici).
//
// Secrets requis (Supabase → Edge Functions → Secrets) :
//   ANTHROPIC_API_KEY   clé API Claude (résumé). Sans elle : 503, rien n'est publié.
//   VEILLE_CRON_SECRET  secret partagé pour l'appel planifié (facultatif si manuel).
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY : injectés auto.
//
// Déploiement : supabase functions deploy veille-cbd
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = (n: string) => Deno.env.get(n) ?? "";

// Requêtes RSS ciblées (Google Actualités FR, 12 derniers jours).
const REQUETES = [
  "CBD chanvre cannabinoïde réglementation",
  "HHC THCP H4CBD cannabinoïde interdit légal",
  "cannabis CBD arrêté décret France loi",
];

// Extraction naïve des <item> d'un flux RSS Google Actualités.
function parseRss(xml: string) {
  const items: { titre: string; lien: string; source: string }[] = [];
  const blocs = xml.split(/<item>/).slice(1);
  for (const b of blocs) {
    const titre = (b.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "")
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .trim();
    const lien = (b.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
    const source = (b.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "")
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .trim();
    if (titre && lien) items.push({ titre, lien, source });
  }
  return items;
}

// Récupère le premier objet JSON d'un texte (l'IA peut l'entourer de prose).
function extraireJson(texte: string) {
  const debut = texte.indexOf("{");
  const fin = texte.lastIndexOf("}");
  if (debut < 0 || fin < 0) return null;
  try {
    return JSON.parse(texte.slice(debut, fin + 1));
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const svc = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

    // --- Autorisation : secret cron OU admin/superadmin connecté ---
    const cronSecret = env("VEILLE_CRON_SECRET");
    const headerSecret = req.headers.get("x-cron-secret");
    const parCron = Boolean(cronSecret) && headerSecret === cronSecret;
    let autorise = parCron;
    if (!autorise) {
      const auth = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      });
      const { data: u } = await auth.auth.getUser();
      if (u?.user) {
        const { data: profil } = await svc.from("users").select("role").eq("id", u.user.id).single();
        if (profil?.role === "admin" || profil?.role === "superadmin") autorise = true;
      }
    }
    if (!autorise) return json({ error: "Non autorisé" }, 401);

    const apiKey = env("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "IA non configurée (ANTHROPIC_API_KEY manquante)." }, 503);

    // --- 1) Collecte RSS ---
    const bruts: { titre: string; lien: string; source: string }[] = [];
    for (const q of REQUETES) {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:12d`)}&hl=fr&gl=FR&ceid=FR:fr`;
      try {
        const r = await fetch(url);
        bruts.push(...parseRss(await r.text()));
      } catch (e) {
        console.error("RSS", q, e);
      }
    }
    // Dédoublonnage par titre.
    const vus = new Set<string>();
    const uniques = bruts.filter((it) => {
      const k = it.titre.toLowerCase();
      if (vus.has(k)) return false;
      vus.add(k);
      return true;
    });
    const top = uniques.slice(0, 40);
    if (top.length === 0) return json({ error: "Aucune actualité récupérée." }, 200);

    // --- 2) Résumé par l'IA ---
    const liste = top.map((t, i) => `${i + 1}. ${t.titre} — ${t.source} — ${t.lien}`).join("\n");
    const prompt =
      `Tu es un veilleur juridique pour des boutiques de CBD en France. Voici des titres d'actualités récentes (titre — source — lien). ` +
      `Sélectionne UNIQUEMENT ce qui concerne réellement la LÉGALITÉ, la RÉGLEMENTATION ou le MARCHÉ du CBD / chanvre / cannabinoïdes ` +
      `(HHC, THCP, H4CBD, CBN, etc.) en France ou en Europe. Ignore le reste (faits divers, ouvertures de magasins, publicités). ` +
      `Réponds en JSON STRICT, sans texte autour : ` +
      `{"intro":"une phrase de synthèse en français","items":[{"categorie":"interdit|autorise|a_suivre","texte":"phrase claire et factuelle en français","source_nom":"nom du média","source_url":"lien"}]}. ` +
      `Maximum 6 items. N'INVENTE RIEN : n'ajoute que ce qui ressort clairement d'un titre. Si rien de pertinent, renvoie "items":[]. ` +
      `Titres :\n${liste}`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) {
      console.error("Anthropic", resp.status, await resp.text());
      return json({ error: "Résumé IA indisponible." }, 502);
    }
    const data = await resp.json();
    const texte = data?.content?.[0]?.text ?? "";
    const parsed = extraireJson(texte);
    if (!parsed || !Array.isArray(parsed.items)) return json({ error: "Résumé illisible." }, 200);

    // Nettoie / borne les items.
    const cats = new Set(["interdit", "autorise", "a_suivre"]);
    const items = parsed.items
      .filter((x: Record<string, unknown>) => x && typeof x.texte === "string")
      .slice(0, 6)
      .map((x: Record<string, unknown>) => ({
        categorie: cats.has(String(x.categorie)) ? x.categorie : "a_suivre",
        texte: String(x.texte).slice(0, 400),
        source_nom: String(x.source_nom ?? "").slice(0, 120),
        source_url: String(x.source_url ?? "").slice(0, 500),
      }));

    // --- 3) Enregistrement ---
    const { error } = await svc.from("veille").insert({
      titre: `Veille CBD — ${new Date().toISOString().slice(0, 10)}`,
      intro: typeof parsed.intro === "string" ? parsed.intro.slice(0, 400) : null,
      items,
      source: parCron ? "auto" : "manuel",
    });
    if (error) {
      console.error("veille insert", error);
      return json({ error: "Enregistrement impossible." }, 500);
    }
    return json({ ok: true, nb: items.length });
  } catch (e) {
    console.error("veille-cbd error:", e);
    return json({ error: "Erreur interne." }, 500);
  }
});
