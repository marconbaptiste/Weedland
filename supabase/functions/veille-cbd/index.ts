// Edge Function — veille-cbd
// News CBD automatique. Deux sources combinees :
//   1) flux RSS (Newsweed + Google Actualites) -> titres recents dates (contexte)
//   2) RECHERCHE WEB active par l'IA Claude (outil serveur web_search_20260209)
//      -> l'IA va chercher elle-meme les nouvelles molecules cannabinoides, les
//         nouveaux produits derives vendables en boutique et les fournisseurs.
// L'IA trie/resume le tout -> bulletin insere dans la table `veille`.
// Bandeau « informations indicatives » cote app (sources citees sous chaque point).
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
    // CLOISONNEMENT (regle absolue) : on ne lit QUE le stock du magasin appelant
    // (magasinId = profil verifie cote serveur, jamais fourni par le client), et
    // UNIQUEMENT `stocks` (noms/categories). On ne lit JAMAIS `fournisseurs` ni
    // aucune donnee sensible/negociee : les fournisseurs, prix et deals prives d'un
    // magasin ne doivent jamais atteindre l'IA ni fuiter vers un autre magasin.
    // Le bulletin genere est ensuite stocke avec ce meme magasin_id (RLS = seul ce
    // magasin le lira). Ne JAMAIS croiser le contexte de plusieurs magasins ici.
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
          "IMPORTANT : si des MOLECULES, PRODUITS ou TENDANCES qui marchent ressortent de tes recherches et NE figurent PAS deja dans ce que vend la boutique, propose-les en categorie 'opportunite' (suggestion d'achat a envisager), en te basant uniquement sur des sources reelles. ";
        for (const c of cats.slice(0, 3)) feedsSup.push({ url: gnews(c + " CBD nouveaute OR tendance OR reglementation"), source: "" });
      }
    }

    // 1) Collecte RSS (contexte date ; peut etre vide, la recherche web prend le relais)
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
    const top = uniques.slice(0, 40);
    const liste = top.length
      ? top
          .map((t, i) => (i + 1) + ". [" + (t.date || "date inconnue") + "] " + t.titre + " — " + t.source + " — " + t.lien)
          .join(NL)
      : "(aucun titre RSS recupere ce coup-ci — appuie-toi sur tes recherches web)";

    const aujourdhui = new Date().toISOString().slice(0, 10);

    // 2) L'IA fait une VRAIE recherche web + resume. Outil serveur web_search.
    const molecules =
      "HHC, HHCP, HHCPO, HHCH, THCP, THCPO, THCJD, THCH, THCB, THCV, THCA, H4CBD, H2CBD, " +
      "CBN, CBG, CBC, CBDV, CBDP, 10-OH-HHC, delta-8 THC, delta-10 THC, delta-6a10a, CBD9, CBDA";
    const prompt =
      "Tu es analyste de veille pour des GERANTS de boutiques de CBD en France. Objectif : leur donner une longueur d'avance concrete. " +
      "Nous sommes le " + aujourdhui + ". " +
      contexteStock +
      "FAIS DE VRAIES RECHERCHES WEB (outil web_search) pour trouver l'actualite la plus RECENTE et PRECISE sur le secteur cannabis/CBD/chanvre, en francais ET en anglais. " +
      "Cherche activement, en plusieurs requetes ciblees, ces trois axes : " +
      "(A) NOUVELLES MOLECULES / CANNABINOIDES (naturels, semi-synthetiques, de synthese) qui sortent ou montent — par ex. " + molecules + " ; leur statut legal en France/UE, ce qui devient interdit ou reste autorise. " +
      "(B) NOUVEAUX PRODUITS DERIVES vendables en boutique (fleurs, resines, huiles, vapes/puffs, e-liquides, infusions, boissons, gummies/comestibles, cosmetiques, champignons/adaptogenes, accessoires) et les TENDANCES qui marchent. " +
      "(C) FOURNISSEURS / GROSSISTES / MARQUES / SALONS PROFESSIONNELS et approvisionnement (nouveaux acteurs, nouvelles gammes annoncees). " +
      "Croise avec ces titres RSS recents (date entre crochets — titre — source — lien) comme point de depart, SANS t'y limiter :" + NL + liste + NL +
      "Regles STRICTES : " +
      "0) Ce bulletin est PRIVE et propre a CETTE boutique. Appuie-toi UNIQUEMENT sur des sources PUBLIQUES (web, presse, RSS). N'invente aucun 'deal', tarif ou accord fournisseur, et ne suppose rien sur les fournisseurs ou secrets commerciaux d'autres boutiques : tu n'as aucune information privee, seulement le web public. " +
      "1) N'INVENTE RIEN. Chaque item doit venir d'une source web reelle que tu as consultee ; recopie fidelement l'URL (source_url) et le nom du media (source_nom), et la date de publication si tu la vois (sinon laisse date vide). " +
      "2) Privilegie les infos des 60 derniers jours ; ecarte le vieux et le hors-sujet. " +
      "3) Pour la categorie fournisseur : cite seulement ceux mentionnes dans une source, NE CLASSE PAS et NE RECOMMANDE PAS de toi-meme un 'meilleur'. " +
      "4) Sois precis et factuel (nom de molecule, nom de produit, nom du texte reglementaire, nom du fournisseur). " +
      "Rends UNIQUEMENT un JSON strict, sans aucun texte autour, de la forme : " +
      '{"intro":"une a deux phrases de synthese en francais","items":[{"categorie":"interdit|autorise|a_suivre|produit|fournisseur|opportunite","texte":"phrase claire et factuelle en francais","date":"AAAA-MM-JJ","source_nom":"nom du media","source_url":"lien"}]}. ' +
      "Vise 8 a 12 items pertinents et varies (couvre les 3 axes A/B/C si la matiere le permet ; max 12). Si vraiment rien, renvoie items vide.";

    const tools = [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }];
    const messages: { role: string; content: unknown }[] = [{ role: "user", content: prompt }];
    let data: Record<string, unknown> | null = null;
    let restarts = 0;
    while (true) {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 4000,
          tools,
          messages,
        }),
      });
      if (!resp.ok) {
        console.error("Anthropic", resp.status, await resp.text());
        return json({ error: "Recherche IA indisponible." }, 502);
      }
      data = await resp.json();
      // Boucle serveur d'outils : si l'API met en pause (10 iterations), on relance.
      if (data?.stop_reason === "pause_turn" && restarts < 4) {
        messages.push({ role: "assistant", content: data.content });
        restarts++;
        continue;
      }
      break;
    }

    const blocs = Array.isArray(data?.content) ? (data.content as { type: string; text?: string }[]) : [];
    const texte = blocs.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join(NL);
    const parsed = extraireJson(texte);
    if (!parsed || !Array.isArray(parsed.items)) return json({ error: "Resume illisible." }, 200);

    const cats = new Set(["interdit", "autorise", "a_suivre", "produit", "fournisseur", "opportunite"]);
    // Date fiable : celle du flux (pubDate) retrouvée par le lien ; sinon celle de l'IA.
    const dateParLien = new Map(top.map((t) => [t.lien, t.date]));
    const items = parsed.items
      .filter((x: Record<string, unknown>) => x && typeof x.texte === "string")
      .slice(0, 12)
      .map((x: Record<string, unknown>) => {
        // Securite : source_url vient de pages web (contenu non fiable via web_search).
        // On n'accepte QUE http(s) pour fermer un vecteur XSS (javascript:, data:, ...).
        const brut = String(x.source_url ?? "").slice(0, 500).trim();
        const url = /^https?:\/\//i.test(brut) ? brut : "";
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
      titre: (magasinId ? "News ciblée — " : "News CBD — ") + aujourdhui,
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
