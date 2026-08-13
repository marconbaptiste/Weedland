// Edge Function — veille-cbd
// Veille reglementaire CBD automatique : flux RSS (Newsweed + Google Actualites)
// -> tri/resume par l'IA Claude -> bulletin insere dans la table `veille`
// (partagee par tous les magasins). Bandeau « informations indicatives » cote app.
//
// Auth : en-tete `x-cron-secret` (tache planifiee) OU JWT admin/superadmin.
// Secrets : ANTHROPIC_API_KEY (obligatoire), VEILLE_CRON_SECRET (cron).
// Deploiement : supabase functions deploy veille-cbd

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = (n: string) => Deno.env.get(n) ?? "";
const NL = String.fromCharCode(10);

const gnews = (q: string) =>
  "https://news.google.com/rss/search?q=" + encodeURIComponent(q) + "&hl=fr&gl=FR&ceid=FR:fr";
const FEEDS: { url: string; source: string }[] = [
  { url: "https://www.newsweed.fr/feed/", source: "Newsweed" },
  { url: gnews("CBD OR chanvre OR cannabinoide reglementation France"), source: "" },
  { url: gnews("HHC OR THCP OR H4CBD OR CBN cannabinoide interdit OR legal"), source: "" },
  { url: gnews("nouveau produit CBD OR boutique CBD tendance"), source: "" },
  { url: gnews("grossiste CBD OR fournisseur CBD OR salon professionnel chanvre"), source: "" },
];
const UA = "Mozilla/5.0 (compatible; KanabizVeille/1.0)";

function texteEntre(s: string, a: string, b: string): string {
  const i = s.indexOf(a);
  if (i < 0) return "";
  const j = s.indexOf(b, i + a.length);
  if (j < 0) return "";
  return s.slice(i + a.length, j);
}
function nettoie(s: string): string {
  return s.split("<![CDATA[").join("").split("]]>").join("").trim();
}
// Parse RSS sans expression reguliere (evite tout souci d'echappement).
function parseRss(xml: string) {
  const items: { titre: string; lien: string; source: string }[] = [];
  const blocs = xml.split("<item").slice(1);
  for (const brut of blocs) {
    const b = brut.slice(brut.indexOf(">") + 1);
    const titre = nettoie(texteEntre(b, "<title>", "</title>"));
    const lien = nettoie(texteEntre(b, "<link>", "</link>"));
    const srcBrut = texteEntre(b, "<source", "</source>");
    const source = nettoie(srcBrut.indexOf(">") >= 0 ? srcBrut.slice(srcBrut.indexOf(">") + 1) : srcBrut);
    if (titre && lien) items.push({ titre, lien, source });
  }
  return items;
}
function extraireJson(texte: string) {
  const d = texte.indexOf("{");
  const f = texte.lastIndexOf("}");
  if (d < 0 || f < 0) return null;
  try {
    return JSON.parse(texte.slice(d, f + 1));
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const svc = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

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
    if (!autorise) return json({ error: "Non autorise" }, 401);

    const apiKey = env("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "IA non configuree (ANTHROPIC_API_KEY manquante)." }, 503);

    // 1) Collecte RSS
    const bruts: { titre: string; lien: string; source: string }[] = [];
    const diag: string[] = [];
    for (const feed of FEEDS) {
      const nom = feed.source || "gnews";
      try {
        const r = await fetch(feed.url, {
          headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
        });
        const xml = await r.text();
        const items = parseRss(xml).map((it) => ({ ...it, source: it.source || feed.source }));
        diag.push(nom + ":" + r.status + ":" + items.length);
        bruts.push(...items);
      } catch (e) {
        console.error("RSS", feed.url, e);
        diag.push(nom + ":ERR");
      }
    }
    console.log("veille RSS diag " + diag.join(" | ") + " total " + bruts.length);

    const vus = new Set<string>();
    const uniques = bruts.filter((it) => {
      const k = it.titre.toLowerCase();
      if (vus.has(k)) return false;
      vus.add(k);
      return true;
    });
    const top = uniques.slice(0, 40);
    if (top.length === 0) return json({ error: "Aucune actualite recuperee (" + diag.join(", ") + ")." }, 200);

    // 2) Resume par l'IA
    const liste = top.map((t, i) => (i + 1) + ". " + t.titre + " — " + t.source + " — " + t.lien).join(NL);
    const prompt =
      "Tu fais une veille pour des GERANTS de boutiques de CBD en France, pour qu'ils aient une longueur d'avance. Voici des titres d'actualites recentes (titre — source — lien). " +
      "Retiens ce qui aide concretement une boutique : (1) LEGALITE / REGLEMENTATION du CBD, chanvre, THC et cannabinoides de synthese (HHC, THCP, H4CBD, CBN, etc.) en France/Europe ; " +
      "(2) NOUVEAUX PRODUITS et TENDANCES vendables en boutique CBD (fleurs, resines, huiles, vapes/puffs, infusions, boissons, cosmetiques, comestibles, accessoires, champignons/adaptogenes, etc.) ; " +
      "(3) FOURNISSEURS / GROSSISTES / SALONS PROFESSIONNELS et approvisionnement. " +
      "Ignore le hors-sujet (faits divers, ouvertures de magasins isolees, pub). " +
      "Reponds en JSON STRICT, sans texte autour : " +
      '{"intro":"une phrase de synthese en francais","items":[{"categorie":"interdit|autorise|a_suivre|produit|fournisseur","texte":"phrase claire et factuelle en francais","source_nom":"nom du media","source_url":"lien"}]}. ' +
      "Maximum 8 items. N'INVENTE RIEN : n'ajoute que ce qui ressort clairement d'un titre/source. " +
      "Pour la categorie fournisseur : cite seulement ceux mentionnes dans les sources, NE CLASSE PAS et NE RECOMMANDE PAS de toi-meme. Si rien de pertinent, renvoie items vide. " +
      "Titres :" + NL + liste;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) {
      console.error("Anthropic", resp.status, await resp.text());
      return json({ error: "Resume IA indisponible." }, 502);
    }
    const data = await resp.json();
    const texte = data?.content?.[0]?.text ?? "";
    const parsed = extraireJson(texte);
    if (!parsed || !Array.isArray(parsed.items)) return json({ error: "Resume illisible." }, 200);

    const cats = new Set(["interdit", "autorise", "a_suivre", "produit", "fournisseur"]);
    const items = parsed.items
      .filter((x: Record<string, unknown>) => x && typeof x.texte === "string")
      .slice(0, 8)
      .map((x: Record<string, unknown>) => ({
        categorie: cats.has(String(x.categorie)) ? x.categorie : "a_suivre",
        texte: String(x.texte).slice(0, 400),
        source_nom: String(x.source_nom ?? "").slice(0, 120),
        source_url: String(x.source_url ?? "").slice(0, 500),
      }));

    // 3) Enregistrement
    const { error } = await svc.from("veille").insert({
      titre: "Veille CBD — " + new Date().toISOString().slice(0, 10),
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
