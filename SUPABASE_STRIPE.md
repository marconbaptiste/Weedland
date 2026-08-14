# Abonnements Stripe (facturation des magasins)

Facturation complète : chaque magasin a un abonnement Stripe (essai 14 j → payant).
Le **mode pilote** affiche le statut + l'échéance et permet de s'abonner / gérer.
Un **webhook** synchronise l'état dans `magasins` (qui pilote le blocage existant).

## Grille tarifaire (HT / mois / magasin)

Source unique : `src/lib/tarifs.js` (répliquée dans l'Edge Function
`stripe-options` — garder les deux cohérentes).

- **Socle « Comptoir » : 29 €** — caisse, clôtures, dettes clients, fiches,
  journal, comptes équipe. C'est le prix du `STRIPE_PRICE_ID`.
- **Options** (une ligne d'abonnement Stripe chacune) : Stocks **+10 €** ·
  Fidélité **+12 €** · Livraisons **+8 €** · Planning **+8 €** · Compta Pro
  **+12 €** · News IA **+9 €**.
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

1. **Produit socle** : Dashboard Stripe → Produits → « Kanabiz — Socle Comptoir »
   + prix mensuel récurrent **29 €** → note l'ID (`price_…`) → `STRIPE_PRICE_ID`.
   *(Si l'ancien prix 49 € existe : crée un NOUVEAU prix 29 € sur le produit et
   remplace le secret — les abonnés existants gardent leur ancien prix tant que
   tu ne les migres pas.)*
2. **Produits options** (un produit + prix mensuel récurrent chacun) :

   | Produit | Prix | Secret |
   |---|---|---|
   | Option Stocks & achats | 10 € | `STRIPE_PRICE_STOCK` |
   | Option Fidélité & promos | 12 € | `STRIPE_PRICE_FIDELITE` |
   | Option Commandes & livraisons | 8 € | `STRIPE_PRICE_LIVRAISONS` |
   | Option Planning & horaires | 8 € | `STRIPE_PRICE_PLANNING` |
   | Option Compta Pro | 12 € | `STRIPE_PRICE_COMPTA` |
   | Option News IA | 9 € | `STRIPE_PRICE_NEWS` |

   *(Fidélité passait de 20 € → 12 € et Planning de 5 € → 8 € : crée de nouveaux
   prix et mets à jour les secrets.)*
3. **Rien à créer pour les packs** : les coupons `pack-remise-…` sont créés
   automatiquement par `stripe-options` au premier besoin.
4. **Clé secrète** : Developers → API keys → **Secret key** (`sk_live_…` ou `sk_test_…`).
5. **Webhook** : Developers → Webhooks → *Add endpoint* :
   - URL : `https://<projet>.supabase.co/functions/v1/stripe-webhook`
   - Événements : `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`.
   - Récupère le **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.
6. **Codes promo** (optionnel) : coupons « −20 % forever » (2ᵉ magasin) et
   l'équivalent « 2 mois offerts » (ex. −16,7 % sur 12 mois, ou un prix annuel
   dédié) + *promotion codes* associés, à donner aux gérants.

## 2. Secrets Supabase (toi)

Edge Functions → Secrets :

| Secret | Valeur |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_…` |
| `STRIPE_PRICE_ID` | `price_…` (socle 29 €) |
| `STRIPE_PRICE_STOCK` / `_FIDELITE` / `_LIVRAISONS` / `_PLANNING` / `_COMPTA` / `_NEWS` | `price_…` des options |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `APP_PUBLIC_URL` | ex. `https://weedland-tawny.vercel.app` |

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
