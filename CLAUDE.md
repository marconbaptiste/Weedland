# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Le produit, l'interface et les commentaires de code sont **en français**. Conservez cette convention.

## Présentation

Weedland est une application web de gestion pour un magasin de CBD (vente au comptoir, plusieurs employés). Objectif : remplacer un suivi manuel sur WhatsApp par une plateforme rapide au comptoir sur mobile et consultable sur ordinateur. Deux rôles : **employé** (saisit ses opérations, voit son historique) et **admin/employeur** (vue consolidée, exports, gestion des comptes).

## Stack

- **Front** : React 18 + Vite, responsive mobile-first, thème sombre par défaut, interface 100 % en français.
- **Back / BDD / Auth** : Supabase (PostgreSQL + Auth + Row Level Security). Pas de backend custom — tout passe par le client `@supabase/supabase-js` et la RLS.
- **Tests** : Vitest (logique métier en pur Node).
- **Déploiement** : Vercel (`vercel.json` : framework Vite + rewrite SPA `/(.*) → /index.html`, indispensable pour React Router). Variables `VITE_SUPABASE_*` à définir dans Vercel. Le dossier `supabase/` n'est pas déployé par Vercel.

## Commandes

```bash
npm install          # dépendances
npm run dev          # serveur de dev Vite
npm run build        # build de production
npm run preview      # prévisualise le build
npm test             # lance toute la suite Vitest (une fois)
npm run test:watch   # Vitest en mode watch
npm run lint         # ESLint
```

Lancer un seul fichier ou test :

```bash
npx vitest run src/lib/comptabilite.test.js          # un fichier
npx vitest run -t "réconciliation"                   # tests dont le nom matche
```

## Configuration

Copier `.env.example` en `.env` et renseigner `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`. `src/lib/supabase.js` lève une erreur explicite si elles manquent. Le `.env` n'est jamais committé.

## Base de données (Supabase)

Le SQL vit dans `supabase/` et s'exécute dans l'éditeur SQL Supabase, **dans cet ordre** :

1. `schema.sql` — tables, vues calculées, trigger de création de profil.
2. `policies.sql` — RLS (à exécuter après le schéma).

Tables (modèle imposé, ne pas renommer) : `users` (profil lié à `auth.users`, porte le `role`), `clients`, `caisse_jour`, `chromes`, `paiements_employes`. À l'inscription d'un utilisateur Supabase Auth, le trigger `handle_new_user` crée automatiquement la ligne `public.users` (rôle `employe` par défaut).

**Vues calculées** (jamais de CA stocké en dur) — toutes en `security_invoker = on` pour respecter la RLS de l'appelant :
- `v_ca_jour` : par clôture de caisse, expose `ca_jour`, `encaissements`, `encaissements_attendus`, `ecart`. C'est la traduction SQL de la règle métier ci-dessous.
- `v_solde_client` : solde dû par client.
- `v_chromes_jour` : agrégat des chromes par (date, employé).

### Modèle RLS (sécurité — à comprendre avant toute modif de données)

La fonction `est_admin()` est `SECURITY DEFINER` (contourne la RLS de `users` pour éviter la récursion). Logique de visibilité :
- **caisse_jour** et **paiements_employes** : un employé ne voit/gère QUE ses propres lignes ; l'admin voit tout. Les paiements ne sont créés/modifiés que par l'admin.
- **clients** et **chromes** : registre **partagé** en lecture/saisie entre tous les employés connectés — au comptoir, n'importe quel employé doit pouvoir encaisser le remboursement d'un client ou consulter sa dette. Toute ligne de chrome est attribuée à l'employé connecté (`employe_id = auth.uid()`).
- **users** : chacun voit son profil ; seul l'admin gère les comptes.

## Logique comptable CA/chromes — POINT CRITIQUE

Toute la règle métier sensible est centralisée dans **`src/lib/comptabilite.js`** (fonctions pures) et couverte par `src/lib/comptabilite.test.js`. **Ne pas dupliquer ces calculs dans les composants** : importer ces fonctions. La même logique est répliquée en SQL dans `v_ca_jour` — garder les deux cohérentes.

Un « chrome » = une avance (crédit) faite à un client.

- **CA du jour** = `ventes_directes + Σ avances du jour − Σ remboursements du jour`
- **Encaissements du jour** = `CB + espèces` (argent réellement entré ; le champ « Moro » de l'UI = espèces)
- **Solde client** = `Σ avances − Σ remboursements` (statut « Dette en cours » si > 0, sinon « Soldé »)
- **Contrôle de cohérence de caisse** : `(CB + espèces)` doit égaler `(ventes_directes + remboursements du jour)`. Voyant vert si écart = 0, rouge + écart chiffré sinon. Raison : une avance gonfle le CA mais **n'entre pas en caisse** ; un remboursement entre en caisse.

**CA ≠ Encaissements dès qu'il y a des chromes** — les deux chiffres sont toujours affichés séparément, jamais confondus.

**Arithmétique en centimes** : tous les calculs passent par `enCentimes()` (entiers) pour éviter les erreurs de virgule flottante (`0,1 + 0,2`). Toute nouvelle somme de montants doit utiliser `somme()` plutôt qu'un `+` direct.

## Architecture du front

- `src/main.jsx` : monte `BrowserRouter` > `AuthProvider` > `App`.
- `src/auth/AuthProvider.jsx` : contexte d'auth. Expose `session`, `utilisateur`, `profil`, `estAdmin`, `chargement`, `connexion()`, `deconnexion()`. Le rôle vient de la table `users`. Utiliser `useAuth()`.
- `src/App.jsx` : routes. Tout est protégé par `RequireAuth` ; `/dashboard` et `/paiements` sont en plus derrière `RequireAdmin` (voir `src/components/Gardes.jsx`). `/connexion` est la page publique.
- `src/components/Layout.jsx` : en-tête + nav (liens admin conditionnés par `estAdmin`) + `<Outlet>`.
- `src/pages/` : un fichier par module — `Caisse.jsx` (clôture journalière), `Chromes.jsx` (avances/remboursements clients), `Historique.jsx` (clôtures de l'employé), `Paiements.jsx` (admin), `Dashboard.jsx` (admin, vue consolidée + export CSV/PDF), `Journal.jsx` (admin, flux d'activité), `Comptes.jsx` (admin, gestion des comptes).
- `supabase/functions/creer-employe/` : Edge Function (Deno) qui crée un compte Auth + profil. Vérifie que l'appelant est admin, puis utilise la clé `service_role` (jamais exposée au front). Le front l'appelle via `supabase.functions.invoke('creer-employe', …)`. Déploiement : `supabase functions deploy creer-employe`.
- `src/lib/` : `comptabilite.js` (logique métier), `format.js` (euros/dates FR + `parseMontant`), `dates.js` (ISO local, intervalles jour/semaine/mois), `export.js` (CSV Excel via `telechargerCSV` + PDF via `telechargerPDF` avec jsPDF/autotable), `supabase.js` (client).

### Conventions front

- **Saisie de montants** : utiliser `<ChampMontant>` (`inputMode="decimal"`, clavier mobile). L'état reste une **string brute** pendant la frappe ; convertir avec `parseMontant()` au calcul et à l'enregistrement. Afficher avec `formatEuros()` / `formatNombre()`.
- **Format français** : virgule décimale en saisie et à l'affichage. `parseMontant` accepte `"1 234,56 €"`, `"12,50"`, `"12.5"`.
- **Accès données** : appels Supabase directs dans les composants (pas de couche service séparée). Les agrégats de lecture passent par les vues `v_*`. Filtrer par employé via `employe_id` ; la RLS fait respecter les droits côté serveur (ne pas s'y substituer côté client pour la sécurité).
- **Minimum de clics** : l'UX est pensée pour le comptoir mobile (formulaires courts, calculs en temps réel).

### RGPD

Les clients ne sont **jamais** identifiés par leur nom/prénom réel. La table `clients` ne contient qu'un **`surnom`** et une **`description`** interne (repère pour le personnel, visible uniquement via la RLS), plus le solde calculé. Ne pas ajouter de coordonnées ou d'identifiants personnels réels au modèle `clients`.

## État du projet

Application complète : schéma + RLS, auth par rôle, et tous les modules — Caisse, Chromes, Historique, Paiements, Dashboard (exports **CSV/Excel et PDF**), Journal (flux d'activité) et Comptes (gestion + création via Edge Function). Le journal est dérivé des `created_at`/`employe_id` existants (pas de table de logs redondante).
