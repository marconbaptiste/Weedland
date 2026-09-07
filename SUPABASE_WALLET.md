# Apple Wallet — carte de fidélité (.pkpass)

Ajoute un bouton **« Ajouter à Apple Wallet »** sur la carte du client. Le pass
est généré et **signé** par l'Edge Function `supabase/functions/carte-wallet`.

> Version actuelle = **pass statique** : les étoiles sont figées au moment du
> téléchargement (re-télécharger le pass = étoiles à jour). La mise à jour
> automatique dans Wallet (web service + APNs) est une étape ultérieure.

---

## 1. Côté Apple (toi — ~30 min, compte payant)

1. **Apple Developer Program** : adhérer (99 €/an) → https://developer.apple.com/programme/
2. **Créer un Pass Type ID** : Certificates, IDs & Profiles → Identifiers → **+** →
   *Pass Type IDs* → ex. `pass.com.weedland.fidelite`. Note-le (= `APPLE_PASS_TYPE_ID`).
3. **Certificat de signature** : sur ce Pass Type ID → *Create Certificate* →
   suivre la procédure (CSR généré depuis « Trousseau d'accès » sur Mac, ou via
   openssl). Télécharger le `.cer`.
4. **Exporter en PEM** (sur Mac, importer le `.cer` dans Trousseau, exporter en
   `.p12`, puis) :
   ```bash
   # certificat (PEM)
   openssl pkcs12 -in Certificates.p12 -clcerts -nokeys -out pass-cert.pem -legacy
   # clé privée (PEM) — choisis un mot de passe à la demande
   openssl pkcs12 -in Certificates.p12 -nocerts -out pass-key.pem -legacy
   ```
5. **Certificat WWDR** (intermédiaire Apple) : télécharger
   https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer puis :
   ```bash
   openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr.pem
   ```
6. **Team ID** : visible en haut à droite du portail Apple Developer (= `APPLE_TEAM_ID`).

---

## 2. Secrets Supabase (toi)

Dans Supabase → Project Settings → **Edge Functions → Secrets** (ou
`supabase secrets set …`), définir :

| Secret | Valeur |
|---|---|
| `APPLE_PASS_TYPE_ID` | ex. `pass.com.weedland.fidelite` |
| `APPLE_TEAM_ID` | ton Team ID Apple |
| `APPLE_PASS_CERT` | contenu de `pass-cert.pem` |
| `APPLE_PASS_KEY` | contenu de `pass-key.pem` |
| `APPLE_PASS_KEY_PASSWORD` | mot de passe choisi à l'étape 4 (sinon vide) |
| `APPLE_WWDR` | contenu de `wwdr.pem` |
| `WALLET_ORG_NAME` | (optionnel) nom affiché ; défaut = nom du magasin |
| `APP_PUBLIC_URL` | (optionnel) ex. `https://weedland-tawny.vercel.app` |

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont déjà disponibles.

---

## 3. Déployer la fonction (toi)

```bash
supabase functions deploy carte-wallet --no-verify-jwt
```
(`--no-verify-jwt` : appel public, comme la carte.)

Tester : ouvre dans Safari iPhone
`https://<projet>.supabase.co/functions/v1/carte-wallet?c=<UN_CLIENT_ID>` →
Safari doit proposer **« Ajouter à Apple Wallet »**.

---

## 4. Activer le bouton dans l'app

Une fois la fonction OK, dans **Vercel → Environment Variables**, ajouter :

```
VITE_WALLET_ACTIF = true
```

(et redéployer). Le bouton « Ajouter à Apple Wallet » apparaîtra alors sur la
carte (`/carte/:id`) côté iPhone. Tant que la variable n'est pas à `true`, le
bouton reste **masqué** (pas de bouton cassé exposé aux clients).

---

## Images du pass

`supabase/functions/carte-wallet/pass/` contient des icônes **placeholder**
(carrés verts). Remplace-les par ton logo (mêmes noms / tailles) pour un rendu
soigné : `icon.png` 29×29, `icon@2x` 58×58, `icon@3x` 87×87, `logo.png` 160×50,
`logo@2x` 320×100, `logo@3x` 480×150.

## Plus tard — mise à jour live

Pour que les étoiles se mettent à jour seules dans Wallet : ajouter
`webServiceURL` + `authenticationToken` au pass, implémenter les routes
d'enregistrement de device et l'envoi **APNs** à chaque tampon. À faire dans un
second temps.
