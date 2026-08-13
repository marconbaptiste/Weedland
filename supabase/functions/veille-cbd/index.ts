// Edge Function — veille-cbd
// News CBD automatique. Deux sources combinees :
//   1) flux RSS (Newsweed + Google Actualites) -> titres recents dates (contexte)
//   2) RECHERCHE WEB active par l'IA Claude (outil serveur web_search_20260209)
//      -> l'IA cherche elle-meme les nouvelles molecules cannabinoides, les
//         nouveaux produits derives vendables en boutique et les fournisseurs.
// L'IA trie/resume le tout -> bulletin insere dans la table `veille`.
//
// FIABILITE / EFFICACITE : la recherche web peut etre longue et l'Edge Function
// a une limite de duree (~150 s, erreur 546). On :
//   - repond 202 tout de suite et travaille EN TACHE DE FOND (EdgeRuntime.waitUntil),
//     donc ca continue meme si l'utilisateur ferme l'app ;
//   - borne la recherche web (max_uses bas) et l'entoure d'un GARDE-TEMPS (AbortController) ;
//   - si la recherche web echoue/depasse, on bascule sur un RESUME RSS RAPIDE (sans
//     outil) pour TOUJOURS produire un bulletin dans les temps.
//
// Auth : en-tete `x-cron-secret` (tache planifiee) OU JWT admin/superadmin.
// Secrets : ANTHROPIC_API_KEY (obligatoire), VEILLE_CRON_SECRET (cron).
// Deploiement : supabase functions deploy veille-cbd

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

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
function dateISO(s: string): string {
  const raw = nettoie(s);
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}
type Article = { titre: string; lien: string; source: string; date: string };
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

// Un appel Claude, avec ou sans recherche web, borne par un garde-temps.
// Renvoie l'objet JSON parse, ou null (echec/timeout/illisible).
async function appelIA(
  apiKey: string,
  prompt: string,
  withWebSearch: boolean,
  maxTokens: number,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const minuteur = setTimeout(() => controller.abort(), timeoutMs);
  const messages: { role: string; content: unknown }[] = [{ role: "user", content: prompt }];
  const tools = withWebSearch ? [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }] : undefined;
  let data: Record<string, unknown> | null = null;
  let restarts = 0;
  try {
    while (true) {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: maxTokens, ...(tools ? { tools } : {}), messages }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        console.error("Anthropic", resp.status, (await resp.text()).slice(0, 300));
        return null;
      }
      data = await resp.json();
      if (withWebSearch && data?.stop_reason === "pause_turn" && restarts < 2) {
        messages.push({ role: "assistant", content: data.content });
        restarts++;
        continue;
      }
      break;
    }
  } catch (e) {
    console.error("appelIA interrompu (timeout/erreur):", String(e).slice(0, 200));
    return null;
  } finally {
    clearTimeout(minuteur);
  }
  const blocs = Array.isArray(data?.content) ? (data.content as { type: string; text?: string }[]) : [];
  const texte = blocs.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join(NL);
  return extraireJson(texte);
}

// Travail lourd (RSS + IA + recherche web + insertion). Lance en tache de fond.
async function genererEtInserer(svc: SupabaseClient, magasinId: string | null, parCron: boolean) {
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("veille: ANTHROPIC_API_KEY manquante");
    return;
  }

  // CLOISONNEMENT (regle absolue) : on ne lit QUE le stock du magasin appelant
  // (magasinId = profil verifie cote serveur, jamais fourni par le client), et
  // UNIQUEMENT `stocks` (noms/categories). On ne lit JAMAIS `fournisseurs` ni
  // aucune donnee sensible : les fournisseurs, prix et deals prives d'un magasin
  // ne doivent jamais atteindre l'IA ni fuiter vers un autre magasin.
  let contexteStock = "";
  if (magasinId) {
    const { data: st } = await svc.from("stocks").select("categorie, nom").eq("magasin_id", magasinId).limit(300);
    const cats = [...new Set((st ?? []).map((s) => (s.categorie || "").trim()).filter(Boolean))].slice(0, 6);
    const noms = [...new Set((st ?? []).map((s) => (s.nom || "").trim()).filter(Boolean))].slice(0, 15);
    if (cats.length || noms.length) {
      contexteStock =
        "Cette boutique vend notamment : " + [...cats, ...noms].join(", ") +
        ". Priorise les infos utiles a ces produits (nouveautes, reglementation, fournisseurs). " +
        "Si des MOLECULES, PRODUITS ou TENDANCES qui marchent ressortent et NE figurent PAS deja dans ce que vend la boutique, propose-les en categorie 'opportunite' (suggestion d'achat), en te basant uniquement sur des sources reelles. ";
    }
  }

  // 1) Collecte RSS (contexte date ; peut etre vide, la recherche web prend le relais)
  const bruts: Article[] = [];
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
  const listeSrc = top.slice(0, 22);
  const liste = listeSrc.length
    ? listeSrc
        .map((t, i) => (i + 1) + ". [" + (t.date || "date inconnue") + "] " + t.titre + " — " + t.source + " — " + t.lien)
        .join(NL)
    : "(aucun titre RSS recupere ce coup-ci)";

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const molecules =
    "HHC, HHCP, HHCPO, HHCH, THCP, THCPO, THCJD, THCH, THCB, THCV, THCA, H4CBD, H2CBD, " +
    "CBN, CBG, CBC, CBDV, CBDP, 10-OH-HHC, delta-8 THC, delta-10 THC, delta-6a10a, CBD9, CBDA";

  // Bloc de regles + forme JSON, partage par les deux variantes de prompt.
  const finJson =
    "Regles STRICTES : " +
    "0) Bulletin PRIVE et propre a CETTE boutique. Sources PUBLIQUES uniquement. N'invente aucun 'deal', tarif ou accord fournisseur, ne suppose rien sur les secrets d'autres boutiques. " +
    "1) N'INVENTE RIEN : chaque item vient d'une source reelle ; recopie l'URL (source_url), le media (source_nom) et la date si visible. " +
    "2) Categories : 'produit' = un produit/gamme precis qui sort (vendable en boutique) ; 'fournisseur' = grossiste/marque/distributeur/salon avec une nouveaute ; 'opportunite' = molecule/produit qui monte et que la boutique ne vend pas encore ; 'interdit'/'autorise'/'a_suivre' = reglementaire. " +
    "Rends UNIQUEMENT un JSON strict, sans texte autour. Ecris TROIS syntheses courtes en francais (1 a 2 phrases chacune, vide si rien) : 'intro' = synthese generale du jour ; 'synthese_produits' = nouveautes produits & fournisseurs ; 'synthese_reglementation' = legal & reglementaire. Puis 'items' = le detail source par source. Forme EXACTE : " +
    '{"intro":"...","synthese_produits":"...","synthese_reglementation":"...","items":[{"categorie":"interdit|autorise|a_suivre|produit|fournisseur|opportunite","texte":"phrase claire et factuelle","date":"AAAA-MM-JJ","source_nom":"nom du media","source_url":"lien"}]}.';

  const cadre =
    "Tu es analyste de veille pour des GERANTS de boutiques de CBD en France (longueur d'avance COMMERCIALE : produits a mettre en rayon, fournisseurs). Nous sommes le " + aujourdhui + ". " +
    "PERIMETRE STRICT — reste EXCLUSIVEMENT sur les CANNABINOIDES : CBD, chanvre, THC et cannabinoides/derivees (molecules " + molecules + "), leur cadre LEGAL en France/UE, les PRODUITS cannabinoides/derives vendables en boutique, et les FOURNISSEURS/grossistes/marques/salons. N'explore AUCUN sujet hors de ce perimetre (legalisation etrangere, cannabis medical etranger, faits divers, politique) sauf IMPACT DIRECT sur une boutique CBD en France. " +
    contexteStock;

  // Variante 1 : recherche web active (riche, mais bornee dans le temps).
  const promptWeb =
    cadre +
    "Utilise l'outil web_search en quelques requetes CIBLEES (fr + en). Couvre 3 axes, PRIORITE aux nouveautes produits & fournisseurs : " +
    "(A) MOLECULES : ce qui sort ou change de statut legal en France/UE. " +
    "(B) NOUVEAUX PRODUITS a vendre en boutique : lancements CONCRETS de marques (puff/vape, e-liquide, fleur/resine/hash, huile, boisson, gummies, nouveau gout/format, edition limitee) — exemples PRECIS (marque + produit + nouveaute). " +
    "(C) FOURNISSEURS / GROSSISTES / SALONS : nouvelles gammes, nouveaux acteurs, salons pro. " +
    "Vise 8 a 12 items, dont AU MOINS LA MOITIE de type 'produit' ou 'fournisseur' si le web en fournit. Titres RSS recents comme point de depart (surtout reglementaires, ne t'y limite pas) :" + NL + liste + NL + finJson;

  // Variante 2 (repli rapide, sans outil) : tri/resume des titres RSS.
  const promptRss =
    cadre +
    "Sans recherche web, a partir UNIQUEMENT des titres RSS recents ci-dessous : tri, classe et resume ce qui est utile a une boutique CBD (legal, nouveaux produits, fournisseurs). Recopie fidelement lien et date de chaque titre choisi. Vise 6 a 10 items. Titres :" + NL + liste + NL + finJson;

  // On tente la recherche web (garde-temps 90 s) ; sinon repli RSS rapide (25 s).
  // Marge : RSS ~10 s + web ≤90 s + repli ≤25 s ≈ 125 s < limite ~150 s.
  let parsed = await appelIA(apiKey, promptWeb, true, 3500, 90000);
  let via = "web";
  if (!parsed || !Array.isArray(parsed.items)) {
    console.log("veille: bascule sur repli RSS (web indisponible/trop long)");
    parsed = top.length ? await appelIA(apiKey, promptRss, false, 2500, 25000) : null;
    via = "rss";
  }
  if (!parsed || !Array.isArray(parsed.items)) {
    console.error("veille: aucun resume exploitable (web+rss)");
    return;
  }

  const catsOk = new Set(["interdit", "autorise", "a_suivre", "produit", "fournisseur", "opportunite"]);
  const dateParLien = new Map(top.map((t) => [t.lien, t.date]));
  const items = parsed.items
    .filter((x: Record<string, unknown>) => x && typeof x.texte === "string")
    .slice(0, 12)
    .map((x: Record<string, unknown>) => {
      // Securite : source_url vient de pages web (contenu non fiable). http(s) seulement.
      const brut = String(x.source_url ?? "").slice(0, 500).trim();
      const bas = brut.toLowerCase();
      const url = bas.startsWith("http://") || bas.startsWith("https://") ? brut : "";
      const dateIa = typeof x.date === "string" ? x.date.slice(0, 20) : "";
      return {
        categorie: catsOk.has(String(x.categorie)) ? x.categorie : "a_suivre",
        texte: String(x.texte).slice(0, 400),
        date: dateParLien.get(url) || dateIa,
        source_nom: String(x.source_nom ?? "").slice(0, 120),
        source_url: url,
      };
    });

  const synth = (v: unknown) => (typeof v === "string" && v.trim() ? v.slice(0, 600) : null);
  const { error } = await svc.from("veille").insert({
    titre: (magasinId ? "News ciblée — " : "News CBD — ") + aujourdhui,
    intro: typeof parsed.intro === "string" ? parsed.intro.slice(0, 400) : null,
    synthese_produits: synth(parsed.synthese_produits),
    synthese_reglementation: synth(parsed.synthese_reglementation),
    items,
    source: parCron ? "auto" : "manuel",
    magasin_id: magasinId,
  });
  if (error) console.error("veille insert", error);
  else console.log("veille insert OK via=" + via + " nb=" + items.length + " magasin=" + (magasinId ?? "global"));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const svc = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

    const cronSecret = env("VEILLE_CRON_SECRET");
    const headerSecret = req.headers.get("x-cron-secret");
    const parCron = Boolean(cronSecret) && headerSecret === cronSecret;
    let autorise = parCron;
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

    if (!env("ANTHROPIC_API_KEY")) return json({ error: "IA non configuree (ANTHROPIC_API_KEY manquante)." }, 503);

    // Travail long => tache de fond : on repond tout de suite et la generation
    // continue meme si le client se deconnecte (waitUntil garde le worker en vie).
    const tache = genererEtInserer(svc, magasinId, parCron).catch((e) => console.error("veille bg", e));
    try {
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil?.(tache);
    } catch (_e) {
      await tache;
    }
    return json({ ok: true, started: true }, 202);
  } catch (e) {
    console.error("veille-cbd error:", e);
    return json({ error: "Erreur interne." }, 500);
  }
});
