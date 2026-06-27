# Abonnements Stripe (facturation des magasins)

Facturation complète : chaque magasin a un abonnement Stripe (essai 14 j → payant).
Le **mode pilote** affiche le statut + l'échéance et permet de s'abonner / gérer.
Un **webhook** synchronise l'état dans `magasins` (qui pilote le blocage existant).

## Pièces

- DB : colonnes `stripe_customer_id`, `stripe_subscription_id`, `stripe_statut`,
  `echeance` sur `magasins` (migration `2026-06-27-stripe-abonnements.sql`).
- Edge Functions : `stripe-checkout` (s'abonner), `stripe-portal` (gérer),
  `stripe-webhook` (synchro).
- Front : boutons « S'abonner » / « 💳 Gérer » / « 🔗 Lier » + échéance sur les
  cartes du pilote.

---

## 1. Côté Stripe (toi)

1. **Produit + prix récurrent** : Dashboard Stripe → Produits → créer le produit
   « Abonnement Weedland » + un **prix mensuel récurrent**. Note l'ID du prix
   (`price_…`) → `STRIPE_PRICE_ID`. *(Je peux le créer via le connecteur si tu approuves.)*
2. **Clé secrète** : Developers → API keys → **Secret key** (`sk_live_…` ou `sk_test_…`).
3. **Webhook** : Developers → Webhooks → *Add endpoint* :
   - URL : `https://<projet>.supabase.co/functions/v1/stripe-webhook`
   - Événements : `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`.
   - Récupère le **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.

## 2. Secrets Supabase (toi)

Edge Functions → Secrets :

| Secret | Valeur |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_…` |
| `STRIPE_PRICE_ID` | `price_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `APP_PUBLIC_URL` | ex. `https://weedland-tawny.vercel.app` |

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` sont déjà fournis.

## 3. Déployer les fonctions (toi)

```bash
supabase functions deploy stripe-checkout
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
