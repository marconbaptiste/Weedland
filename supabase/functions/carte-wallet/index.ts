// ============================================================================
// Edge Function — carte-wallet
// ----------------------------------------------------------------------------
// Génère un pass Apple Wallet (.pkpass, type « storeCard ») pour la carte de
// fidélité d'un client. Appel public : /carte-wallet?c=<client_id>.
// Le pass embarque le QR (URL /carte/<id>) pour que le personnel le scanne.
//
// PRÉ-REQUIS (secrets à définir, cf. SUPABASE_WALLET.md) :
//   APPLE_PASS_TYPE_ID      ex. pass.com.weedland.fidelite
//   APPLE_TEAM_ID           identifiant d'équipe Apple Developer
//   APPLE_PASS_CERT         certificat de signature (PEM)
//   APPLE_PASS_KEY          clé privée (PEM)
//   APPLE_PASS_KEY_PASSWORD mot de passe de la clé (si chiffrée ; sinon vide)
//   APPLE_WWDR              certificat intermédiaire Apple WWDR (PEM)
//   WALLET_ORG_NAME         (optionnel) nom de l'organisation affiché
//   APP_PUBLIC_URL          (optionnel) base publique, ex. https://weedland-tawny.vercel.app
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement.
//
// NB : version « pass statique » (les étoiles sont figées au téléchargement).
// La mise à jour live (web service + APNs) viendra dans un second temps.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import forge from "npm:node-forge@1.3.1";
import JSZip from "npm:jszip@3.10.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function env(nom: string, obligatoire = true): string {
  const v = Deno.env.get(nom) ?? "";
  if (obligatoire && !v) throw new Error(`Secret manquant : ${nom}`);
  return v;
}

async function sha1Hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Signature PKCS#7 détachée du manifest, avec le certificat de pass + WWDR.
function signerManifest(manifest: string): Uint8Array {
  const certPem = env("APPLE_PASS_CERT");
  const wwdrPem = env("APPLE_WWDR");
  const keyPem = env("APPLE_PASS_KEY");
  const keyPass = env("APPLE_PASS_KEY_PASSWORD", false);

  const cert = forge.pki.certificateFromPem(certPem);
  const wwdr = forge.pki.certificateFromPem(wwdrPem);
  const key = keyPass
    ? forge.pki.decryptRsaPrivateKey(keyPem, keyPass)
    : forge.pki.privateKeyFromPem(keyPem);
  if (!key) throw new Error("Clé privée illisible (mot de passe ?).");

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest, "utf8");
  p7.addCertificate(cert);
  p7.addCertificate(wwdr);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign({ detached: true });
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return Uint8Array.from(der, (c) => c.charCodeAt(0));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const clientId = url.searchParams.get("c") ?? "";
    if (!clientId) {
      return new Response(JSON.stringify({ error: "Paramètre c (client) manquant." }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 1) Données du client (service_role : contourne la RLS, lecture serveur).
    const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: rows, error } = await supabase.rpc("fidelite_etat", { p_client: clientId });
    if (error || !rows || rows.length === 0) {
      return new Response(JSON.stringify({ error: "Carte introuvable." }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const { surnom, tampons, palier, magasin } = rows[0];

    const base = env("APP_PUBLIC_URL", false) || url.origin;
    const orgName = env("WALLET_ORG_NAME", false) || magasin || "Fidélité";

    // 2) pass.json (storeCard).
    const pass = {
      formatVersion: 1,
      passTypeIdentifier: env("APPLE_PASS_TYPE_ID"),
      teamIdentifier: env("APPLE_TEAM_ID"),
      organizationName: orgName,
      serialNumber: clientId,
      description: `Carte de fidélité ${magasin ?? ""}`.trim(),
      logoText: `${magasin ?? ""} Fidélité`.trim(),
      foregroundColor: "rgb(255, 255, 255)",
      backgroundColor: "rgb(15, 17, 21)",
      labelColor: "rgb(63, 174, 107)",
      barcodes: [
        {
          format: "PKBarcodeFormatQR",
          message: `${base}/carte/${clientId}`,
          messageEncoding: "iso-8859-1",
        },
      ],
      storeCard: {
        primaryFields: [
          { key: "etoiles", label: "Étoiles", value: `${tampons} / ${palier}` },
        ],
        secondaryFields: [{ key: "surnom", label: "Carte", value: surnom ?? "Client" }],
        auxiliaryFields: [{ key: "magasin", label: "Magasin", value: magasin ?? "" }],
      },
    };

    // 3) Fichiers du pass (pass.json + icônes).
    const fichiers: Record<string, Uint8Array> = {
      "pass.json": new TextEncoder().encode(JSON.stringify(pass)),
    };
    for (const nom of ["icon.png", "icon@2x.png", "icon@3x.png", "logo.png", "logo@2x.png", "logo@3x.png"]) {
      try {
        fichiers[nom] = await Deno.readFile(new URL(`./pass/${nom}`, import.meta.url));
      } catch {
        /* image optionnelle absente : on l'ignore (icon.png reste requis) */
      }
    }

    // 4) manifest.json (SHA1 de chaque fichier) + signature.
    const manifest: Record<string, string> = {};
    for (const [nom, data] of Object.entries(fichiers)) manifest[nom] = await sha1Hex(data);
    const manifestStr = JSON.stringify(manifest);
    const signature = signerManifest(manifestStr);

    // 5) ZIP → .pkpass.
    const zip = new JSZip();
    for (const [nom, data] of Object.entries(fichiers)) zip.file(nom, data);
    zip.file("manifest.json", manifestStr);
    zip.file("signature", signature);
    const pkpass = await zip.generateAsync({ type: "uint8array" });

    return new Response(pkpass, {
      headers: {
        ...cors,
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="carte-fidelite.pkpass"`,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
