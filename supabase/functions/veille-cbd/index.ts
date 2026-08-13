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
  { url: gnews("CBD OR chanvre OR cannabis arrete OR decret Journal Officiel OR Legifrance"), source: "" },
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
// pubDate RSS ("Wed, 13 May 2026 08:00:00 GMT") -> "2026-05-13" (ou "" si illisible).
function dateISO(s: string): string {
  const raw = nettoie(s);
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}
type Article = { titre: string; lien: string; source: string; date: string };
// Parse RSS sans expression reguliere (evite tout souci d'echappement).
function parseRss(xml: string): Article[] {
  const items: Article[] = [];
  const blocs = xml.split("<item").slice(1);
  for (const brut of blocs) {
    const b = brut.slice(brut.indexOf(">") + 1);
    const titre = nettoie(texteEntre(b, "<title>", "</title>"));
    const lien = nettoie(texteEntre(b, "<link>", "</link>"));
    const srcBrut = texteEntre(b, "<source", "</source>");
    const source = nettoie(srcBrut.indexOf(">") >= 0 ? srcBrut.slice(srcBrut.indexOf(">") + 1) : srcBrut);
    const date = dateISO(texteEntre(b, "<pubDate>", "</pubDate>"));
    if (titre && lien) items.push({ titre, lien, source, date });
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
    // Généré à la main par un admin => bulletin personnalisé pour SON magasin.
    // Généré par le cron => bulletin global (magasin_id NULL, partagé par tous).
    let magasinId: string | null = null;
    if (!autorise) {
      const auth = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      });
      const { data: u } = await auth.auth.getUser();
      if (u?.user) {
        const { data: profil } = await svc.from("users").select("role, magasin_id").eq("id", u.user.id).single();
        if (profil?.role === "admin" || profil?.role === "superadmin") {
          autorise = true;
          magasinId = profil.magasin_id ?? null;
        }
      }
    }
    if (!autorise) return json({ error: "Non autorise" }, 401);

    const apiKey = env("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "IA non configuree (ANTHROPIC_API_KEY manquante)." }, 503);

    // Personnalisation : on lit le stock du magasin pour cibler la recherche.
    let contexteStock = "";
    const feedsSup: { url: string; source: string }[] = [];
    if (magasinId) {
      const { data: st } = await svc.from("stocks").select("categorie, nom").eq("magasin_id", magasinId).limit(300);
      const cats = [...new Set((st ?? []).map((s) => (s.categorie || "").trim()).filter(Boolean))].slice(0, 6);
      const noms = [...new Set((st ?? []).map((s) => (s.nom || "").trim()).filter(Boolean))].slice(0, 15);
      if (cats.length || noms.length) {
        contexteStock =
          "Cette boutique vend notamment : " + [...cats, ...noms].join(", ") +
          ". Priorise les infos utiles a ces produits (nouveautes, reglementation, fournisseurs), sans ignorer la legalite generale. " +
          "IMPORTANT : si des PRODUITS ou TENDANCES qui marchent ressortent des sources et NE figurent PAS deja dans ce que vend la boutique, propose-les en categorie 'opportunite' (suggestion d'achat a envisager), en te basant uniquement sur les sources. ";
        for (const c of cats.slice(0, 3)) feedsSup.push({ url: gnews(c + " CBD nouveaute OR tendance OR reglementation"), source: "" });
      }
    }

    // 1) Collecte RSS
    const bruts: Article[] = [];
    const diag: string[] = [];
    for (const feed of [...FEEDS, ...feedsSup]) {
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
    const top = uniques.slice(0, 55);
    if (top.length === 0) return json({ error: "Aucune actualite recuperee (" + diag.join(", ") + ")." }, 200);

    // 2) Resume par l'IA (la date est indiquee entre [ ] pour chaque titre)
    const liste = top
      .map((t, i) => (i + 1) + ". [" + (t.date || "date inconnue") + "] " + t.titre + " — " + t.source + " — " + t.lien)
      .join(NL);
    const prompt =
      "Tu fais une veille pour des GERANTS de boutiques de CBD en France, pour qu'ils aient une longueur d'avance. " +
      contexteStock +
      "Voici des titres d'actualites recentes, chacun precede de sa DATE entre crochets (date — titre — source — lien). " +
      "Retiens tout ce qui aide concretement une boutique de CBD : (1) LEGALITE / REGLEMENTATION du CBD, chanvre, THC et cannabinoides de synthese (HHC, THCP, H4CBD, CBN, etc.) en France/Europe ; " +
      "(2) NOUVEAUX PRODUITS et TENDANCES vendables en boutique CBD (fleurs, resines, huiles, vapes/puffs, infusions, boissons, cosmetiques, comestibles, accessoires, champignons/adaptogenes, etc.) ; " +
      "(3) FOURNISSEURS / GROSSISTES / SALONS PROFESSIONNELS et approvisionnement. " +
      "Sois GENEREUX : garde tout ce qui touche de pres ou de loin au secteur CBD/chanvre/cannabis et peut interesser un gerant. Ne jette que le vraiment hors-sujet (faits divers sans lien, pub pure). " +
      "Recopie fidelement le lien (source_url) et la date de l'article choisi. " +
      "Reponds en JSON STRICT, sans texte autour : " +
      '{"intro":"une phrase de synthese en francais","items":[{"categorie":"interdit|autorise|a_suivre|produit|fournisseur|opportunite","texte":"phrase claire et factuelle en francais","date":"AAAA-MM-JJ","source_nom":"nom du media","source_url":"lien"}]}. ' +
      "Vise 6 a 10 items pertinents si la matiere le permet (max 10). N'INVENTE RIEN : n'ajoute que ce qui ressort d'un titre/source. " +
      "Pour la categorie fournisseur : cite seulement ceux mentionnes dans les sources, NE CLASSE PAS et NE RECOMMANDE PAS de toi-meme. Si rien de pertinent, renvoie items vide. " +
      "Titres :" + NL + liste;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2200,
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

    const cats = new Set(["interdit", "autorise", "a_suivre", "produit", "fournisseur", "opportunite"]);
    // Date fiable : celle du flux (pubDate) retrouvée par le lien ; sinon celle de l'IA.
    const dateParLien = new Map(top.map((t) => [t.lien, t.date]));
    const items = parsed.items
      .filter((x: Record<string, unknown>) => x && typeof x.texte === "string")
      .slice(0, 10)
      .map((x: Record<string, unknown>) => {
        const url = String(x.source_url ?? "").slice(0, 500);
        const dateIa = typeof x.date === "string" ? x.date.slice(0, 20) : "";
        return {
          categorie: cats.has(String(x.categorie)) ? x.categorie : "a_suivre",
          texte: String(x.texte).slice(0, 400),
          date: dateParLien.get(url) || dateIa,
          source_nom: String(x.source_nom ?? "").slice(0, 120),
          source_url: url,
        };
      });

    // 3) Enregistrement
    const { error } = await svc.from("veille").insert({
      titre: (magasinId ? "Veille ciblée — " : "Veille CBD — ") + new Date().toISOString().slice(0, 10),
      intro: typeof parsed.intro === "string" ? parsed.intro.slice(0, 400) : null,
      items,
      source: parCron ? "auto" : "manuel",
      magasin_id: magasinId,
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
