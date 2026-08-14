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
- **Annuel = 2 mois offerts** et **2ᵉ magasin = −20 %** : à gérer par des
  **codes promo Stripe** (le Checkout a `allow_promotion_codes` activé) — crée
  les coupons/codes dans le Dashboard, rien à coder.

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
   - Événements : `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`.
   - Récupère le **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.
4. **Codes promo** (optionnel) : coupons « −20 % forever » (2ᵉ magasin) et
   l'équivalent « 2 mois offerts » (ex. −16,7 % sur 12 mois, ou un prix annuel
   dédié) + *promotion codes* associés, à donner aux gérants.

## 2. Secrets Supabase (toi)

Edge Functions → Secrets :

| Secret | Valeur |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `APP_PUBLIC_URL` | ex. `https://weedland-tawny.vercel.app` |

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
| `past_due` / `unpaid` / `canceled` / … | `suspendu` | **blocage** (écran AbonnementExpiré) |

> Le blocage réutilise la logique existante (`AuthProvider.magasinBloque`).
