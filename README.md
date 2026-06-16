# 🌿 Weedland

Plateforme de gestion pour magasin de CBD : clôture de caisse, suivi des « chromes » (avances/crédits clients), paiements employés et tableau de bord employeur. Pensée **mobile-first** pour le comptoir, en **français**, thème sombre.

## Stack

- **Front** : React + Vite (thème sombre, responsive)
- **Back / BDD / Auth** : Supabase (PostgreSQL + Auth + Row Level Security)
- **Tests** : Vitest
- **Déploiement** : Vercel

## Démarrage

```bash
npm install
cp .env.example .env   # puis renseigner les clés Supabase
npm run dev
```

### Configuration Supabase

1. Créer un projet sur [supabase.com](https://supabase.com).
2. Dans l'éditeur SQL, exécuter dans l'ordre :
   - `supabase/schema.sql`
   - `supabase/policies.sql`
3. Récupérer l'URL et la clé `anon` (Project Settings → API) et les mettre dans `.env` :
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
4. Créer le premier compte admin via Supabase Auth, puis le promouvoir :
   ```sql
   update public.users set role = 'admin' where id = '<uuid-utilisateur>';
   ```
   Les comptes suivants se créent ensuite depuis l'app (page **Comptes**).
5. Déployer l'Edge Function de création de comptes :
   ```bash
   supabase functions deploy creer-employe
   ```
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont fournies automatiquement au runtime des functions.)

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run preview` | Prévisualisation du build |
| `npm test` | Suite de tests Vitest |
| `npm run lint` | ESLint |

## Concepts clés

- **CA du jour** = ventes directes + avances du jour − remboursements du jour.
- **Encaissements** = CB + espèces (« Moro »). **Différent du CA** dès qu'il y a des chromes.
- **Solde client** = somme des avances − somme des remboursements.
- **Contrôle de caisse** : (CB + espèces) doit égaler (ventes directes + remboursements du jour).

La logique est centralisée et testée dans `src/lib/comptabilite.js`. Voir `CLAUDE.md` pour l'architecture détaillée.

## Modules

- **Caisse** — clôture journalière par employé, calculs et voyant de cohérence en temps réel.
- **Chromes** — fiche client par **surnom** uniquement (+ description interne, jamais de nom réel), avances (+) / remboursements (−), solde et statut en direct.
- **Historique** — clôtures de l'employé connecté.
- **Paiements** *(admin)* — versements aux employés, totaux du mois.
- **Dashboard** *(admin)* — vue consolidée jour/semaine/mois, filtres, exports CSV/Excel et PDF.
- **Journal** *(admin)* — flux chronologique de toutes les saisies (caisse, chromes, paiements).
- **Comptes** *(admin)* — liste des employés, changement de rôle, et création de compte via l'Edge Function `creer-employe`.

## Déploiement (Vercel)

Le projet est prêt pour Vercel (`vercel.json`) : framework Vite détecté, build `npm run build`, sortie `dist`, et une *rewrite* SPA qui renvoie toutes les routes vers `index.html` (indispensable avec React Router, sinon `/chromes` ou `/dashboard` renvoient un 404 au rechargement).

1. Importer le dépôt sur [vercel.com](https://vercel.com) (ou `npx vercel`).
2. Renseigner les variables d'environnement du projet (Settings → Environment Variables) :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Déployer. À chaque push, Vercel rebuild automatiquement.

Le dossier `supabase/` (SQL + Edge Functions) n'est **pas** déployé par Vercel : le SQL s'exécute dans l'éditeur Supabase et les functions via `supabase functions deploy`.

