# Veille réglementaire CBD (bulletin automatique)

Un bulletin **généré automatiquement** par l'IA à partir d'actualités publiques
(flux RSS), affiché dans l'app (page **📰 Veille réglementaire**) avec un bandeau
**« informations indicatives »**. Le contenu est **global** (mêmes lois pour tous
les magasins) : un seul bulletin est produit puis lu par toutes les boutiques →
coût minime.

## Composants déjà en place
- Table `public.veille` (migration `2026-08-11-veille-cbd.sql`) : lecture pour les
  membres connectés, écriture réservée au `service_role`.
- Edge Function `veille-cbd` : génération en **3 volets** (`produits`, `fournisseurs`, `legal`), chacun dans sa propre invocation avec recherche web, fusionnés dans le bulletin du jour (`veille_fusionner`). Le front lance les 3 en parallèle ; le **cron** appelle la fonction **sans** `volet` et elle se rappelle elle-même 3 fois avec le secret (fan-out). Déployée.
- Front : page `/veille`, carte dans **Gestion**, aperçu sur l'accueil, bouton
  **« Générer maintenant »** (admin).

## À configurer pour activer (côté Supabase)

### 1. Clé IA (obligatoire)
`Supabase → Project → Edge Functions → Secrets` → ajouter :
- **`ANTHROPIC_API_KEY`** = ta clé API Claude (créée sur `console.anthropic.com`).

Sans cette clé, la fonction répond « IA non configurée » et ne publie rien
(le reste de l'app fonctionne normalement).

Tu peux alors tester tout de suite : page **Veille → « Générer maintenant »**.

### 2. Automatisation hebdomadaire (facultatif mais recommandé)
Pour un bulletin **100 % automatique** chaque semaine, deux options :

**Option simple — planificateur Supabase**
Dans `Edge Functions → veille-cbd → Schedules`, crée un cron (ex. `0 8 * * 1`
= lundi 8 h) et ajoute l'en-tête `x-cron-secret` avec la valeur du secret ci-dessous.

**Option SQL (pg_cron + pg_net)** — ajoute d'abord le secret
`VEILLE_CRON_SECRET` (une chaîne aléatoire) dans les secrets de l'Edge Function,
puis exécute (en remplaçant `<SECRET>`) :

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'veille-cbd-hebdo',
  '0 8 * * 1',   -- tous les lundis à 8 h (UTC)
  $$
  select net.http_post(
    url     := 'https://nshglljmfskvqxcogdjk.supabase.co/functions/v1/veille-cbd',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);
```

> Remarque : `VEILLE_CRON_SECRET` n'est utile que pour l'appel planifié. La
> génération manuelle depuis l'app est déjà protégée (l'admin doit être connecté).

## Coût
- RSS + hébergement : gratuits.
- IA : ~quelques centimes par bulletin (1 résumé/semaine, partagé par tous les
  magasins) → quelques euros/mois au total.

## Garde-fous
- Bandeau « informations indicatives » permanent + « généré automatiquement ».
- Chaque point renvoie à sa **source** (lien) pour vérification.
- L'IA résume, ne conseille pas : aucune valeur juridique.
