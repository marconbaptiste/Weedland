# Abonnements Stripe (facturation des magasins)

Facturation complète : chaque magasin a un abonnement Stripe (essai 14 j → payant).
Le **mode pilote** affiche le statut + l'échéance et permet de s'abonner / gérer.
Un **webhook** synchronise l'état dans `magasins` (qui pilote le blocage existant).

## Grille tarifaire (HT / mois / magasin)

Source unique : `src/lib/tarifs.js` (répliquée dans l'Edge Function
`stripe-options` — garder les deux cohérentes).

- **Socle « Comptoir » : 29 €** — caisse, clôtures, dettes clients, fiches,
  journal, comptes équipe.
- **Options** (une ligne d'abonnement Stripe chacune) : Stocks **+10 €** ·
  Fidélité **+12 €** · Livraisons **+8 €** · Planning **+8 €** · Compta Pro
  **+12 €** · News IA **+9 €**.
- **Produits & prix auto-provisionnés** : les Edge Functions créent elles-mêmes
  les produits/prix dans Stripe par **lookup_key** (`kanabiz_socle`,
  `kanabiz_stock`, `kanabiz_fidelite`, `kanabiz_livraisons`, `kanabiz_planning`,
  `kanabiz_compta`, `kanabiz_news`) au premier besoin — **rien à créer dans le
  Dashboard**. Si un montant de la grille change dans le code, un nouveau prix
  est créé automatiquement (les abonnés existants gardent leur ancien prix).
- **Packs = plafonds automatiques** : Boutique (Stocks+Fidélité) **45 €**,
  Pro (tout sauf News IA) **59 €**, Premium (tout) **69 €**. Dès que toutes les
  options d'un pack sont actives, `stripe-options` applique un **coupon**
  `pack-remise-<centimes>` (créé automatiquement, `amount_off` forfaitaire,
  `duration: forever`) qui ramène la facture au prix du pack ; les options hors
  pack s'ajoutent au prix du pack. Retirer une option recalcule/retire la remise.
- **Codes promo** : le Checkout a `allow_promotion_codes` activé — tu peux
  créer des coupons/codes dans le Dashboard (ex. −20 % pour un 2ᵉ magasin) et
  les donner à la main. ⚠️ Aucune offre annuelle n'existe (prix mensuels
  uniquement) : **ne pas l'annoncer** dans l'app tant qu'un prix annuel n'est
  pas créé (pratique commerciale trompeuse sinon). La remise pack ne touche
  JAMAIS aux codes promo du client (elle ne gère que ses coupons
  `pack-remise-*`).

## Règles de facturation (audit « revenue correctness »)

- **Source de vérité = les lignes de l'abonnement Stripe.** `stripe-options`
  et `stripe-webhook` relisent l'abonnement et dérivent les 6 drapeaux `opt_*`
  de ses lignes (par `lookup_key`, ou par ancien ID de prix `STRIPE_PRICE_*`
  pour les abonnés de l'ancienne grille). Plus de décalage Stripe ↔ base.
- **Remise pack** calculée sur les montants RÉELS des lignes (un abonné resté
  sur un ancien prix n'est ni sur- ni sous-facturé).
- **Pas de double abonnement** : `stripe-checkout` refuse si le customer a déjà
  un abonnement en cours (et resynchronise la base), et le webhook traite
  `checkout.session.completed` pour poser l'id d'abonnement immédiatement ; le
  front attend cette synchro au retour du Checkout.
- **Pas de double essai** : l'essai Stripe se cale sur `magasins.essai_fin`
  (période commencée à l'inscription). Une **réactivation** (customer ayant déjà
  eu un abonnement) n'a pas de nouvel essai.
- **Résiliation** → `stripe_subscription_id` remis à NULL (customer conservé) :
  le magasin peut se réabonner (« Réactiver »).
- **Impayé** : `past_due` = grâce (Stripe relance, bandeau « mets à jour ta
  carte ») ; `unpaid`/`canceled` = suspendu (blocage).
- **Customer Stripe avec email** (email de l'admin) : reçus, rappel de fin
  d'essai et relances d'impayé partent de Stripe (active-les dans le Dashboard :
  Settings → Emails).
- **Adresse de facturation** toujours collectée au Checkout (mentions de
  facture). **TVA** : voir `STRIPE_TAX_AUTO` ci-dessous.

## Pièces

- DB : colonnes `stripe_customer_id`, `stripe_subscription_id`, `stripe_statut`,
  `echeance` sur `magasins` (migration `2026-06-27-stripe-abonnements.sql`) +
  drapeaux d'options `opt_planning`/`opt_stock`/`opt_fidelite` puis
  `opt_livraisons`/`opt_compta`/`opt_news` (migration
  `2026-08-16b-options-monetisation.sql`).
- Edge Functions : `stripe-checkout` (s'abonner au socle), `stripe-options`
  (ajouter/retirer une option + remise pack), `stripe-portal` (gérer),
  `stripe-webhook` (synchro).
- Front : `GestionOptions.jsx` (Gestion → Abonnement & options, grille + total +
  pack appliqué), boutons « S'abonner » / « 💳 Gérer » / « 🔗 Lier » dans le
  pilote, section tarifs sur la landing (`Landing.jsx`).

---

## 1. Côté Stripe (toi)

> ⚠️ **Teste d'abord en mode test** (clé `sk_test_…`, carte `4242 4242 4242 4242`) :
> je ne peux pas tester la facturation à ta place. Bascule en live seulement
> quand un cycle complet (abonnement → option → pack → retrait) est vérifié.

1. **Rien à créer côté produits/prix/packs** : tout est auto-provisionné par les
   fonctions (lookup_keys `kanabiz_*`, coupons `pack-remise-…`).
2. **Clé secrète** : Developers → API keys → **Secret key** (`sk_live_…` ou `sk_test_…`).
3. **Webhook** : Developers → Webhooks → *Add endpoint* :
   - URL : `https://<projet>.supabase.co/functions/v1/stripe-webhook`
   - Événements : `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`.
   - Récupère le **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.
   - Une seule destination vers cette URL (une destination en double avec une
     autre clé de signature = 100 % d'erreurs).
4. **Emails Stripe** : Settings → Emails → activer les reçus, le rappel de fin
   d'essai et les relances d'impayé (le customer porte l'email de l'admin).
5. **Informations de facturation** : Settings → Business → nom, adresse, SIRET,
   n° de TVA (ou mention « TVA non applicable, art. 293 B du CGI » en pied de
   facture si franchise en base). Obligatoire pour des factures conformes.
6. **Codes promo** (optionnel) : coupons + *promotion codes* dans le Dashboard.

## 2. Secrets Supabase (toi)

Edge Functions → Secrets :

| Secret | Valeur |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `APP_PUBLIC_URL` | ex. `https://kanabiz.dev` |
| `STRIPE_TAX_AUTO` | **`off`** (défaut) ou `on` — voir ci-dessous |

### TVA (`STRIPE_TAX_AUTO`) — DÉCISION : TVA facturée (`on`)

Les prix affichés sont **HT** ; Stripe Tax ajoute la **TVA (20 %)** sur la
facture, calculée d'après l'adresse de facturation collectée au Checkout
(`tax_behavior: exclusive` sur les prix, n° de TVA du client demandé). À faire,
dans l'ordre :

1. Stripe → **Settings → Tax** → **Add registration** → France → date de début
   (ton n° de TVA intracommunautaire doit figurer dans Settings → Business).
2. Stripe → Settings → Tax → **Default tax behavior : Exclusive** (prix HT).
3. Supabase → Edge Functions → Secrets → `STRIPE_TAX_AUTO` = `on`.
4. Recoller/redéployer `stripe-checkout` et `stripe-options` : au prochain
   Checkout ou à la prochaine option activée, un **nouveau prix « exclusive »**
   est créé automatiquement (l'ancien prix garde son id pour les abonnés
   existants, la `lookup_key` est transférée). Un abonnement déjà en cours voit
   `automatic_tax` activé à sa prochaine bascule d'option (adresse de
   facturation requise — sinon un avertissement est renvoyé dans Gestion).
5. Vérifie une facture de test : ligne « TVA 20 % » présente, mentions
   légales (SIRET, n° TVA) dans Settings → Invoice template.

`off` (ancien défaut) = franchise en base : prix prélevés tels quels, ajouter
« TVA non applicable, art. 293 B du CGI » en pied de facture.

*(Les anciens secrets `STRIPE_PRICE_ID` / `STRIPE_PRICE_STOCK` / `_FIDELITE` /
`_PLANNING` peuvent rester : ils ne servent plus qu'à retrouver — pour les
retirer — les lignes d'abonnement posées avec l'ancienne grille.)*

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` sont déjà fournis.

## 3. Déployer les fonctions (toi)

```bash
supabase functions deploy stripe-checkout
supabase functions deploy stripe-options
supabase functions deploy stripe-portal
supabase functions deploy stripe-webhook --no-verify-jwt   # appelé par Stripe (pas de JWT)
```

## 4. Tester

- Dans le pilote, clique **« S'abonner »** sur un magasin → Checkout Stripe
  (carte test `4242 4242 4242 4242`). Au retour, le webhook met le magasin en
  `essai` (14 j) avec l'échéance.
- **« 🔗 Lier »** : pour rattacher un magasin à un client Stripe **existant**
  (colle son `cus_…`).
- **« 💳 Gérer »** : ouvre le portail Stripe (changer la carte, annuler).

## Mapping statut Stripe → application

| Stripe | `abonnement` | effet |
|---|---|---|
| `trialing` | `essai` | accès, `essai_fin` = fin d'essai |
| `active` | `actif` | accès |
| `past_due` | `actif` (grâce) | accès + bandeau « mets à jour ta carte » (`stripe_statut`) |
| `incomplete` | *(inchangé)* | paiement initial en cours |
| `unpaid` / `paused` | `suspendu` | **blocage** (écran AbonnementExpiré) |
| `canceled` / `incomplete_expired` | `suspendu` + `stripe_subscription_id = NULL` | **blocage**, bouton **Réactiver** (nouveau Checkout, sans essai) |

> Le blocage (`AuthProvider.magasinBloque`) : jamais pour le superadmin ni un
> magasin `gratuit` ; avec abonnement Stripe → bloqué si `suspendu` ; sans
> abonnement Stripe → bloqué si `suspendu` ou si l'essai (`essai_fin`) est
> dépassé. Le portail Stripe (`stripe-portal`) utilise une configuration créée
> par code : factures, moyen de paiement, résiliation **en fin de période**,
> pas de changement d'offre (les options se gèrent dans l'app).
