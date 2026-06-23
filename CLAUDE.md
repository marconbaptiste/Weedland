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

Tables (modèle imposé, ne pas renommer) : `users` (profil lié à `auth.users`, porte le `role`), `clients`, `caisse_jour`, `chromes`, `paiements_employes`, `promos` (promotions/traitements de faveur par client, registre partagé comme `chromes`), `comptes_autorises` (allowlist d'emails). À l'inscription d'un utilisateur Supabase Auth, le trigger `handle_new_user` crée la ligne `public.users` **uniquement si l'email est dans `comptes_autorises`** (rôle `employe` par défaut) — sinon le compte connecté n'a pas de profil et n'a aucun accès. C'est ce qui sécurise la connexion **Google** (cf. ci-dessous).

**Vues calculées** (jamais de CA stocké en dur) — toutes en `security_invoker = on` pour respecter la RLS de l'appelant :
- `v_ca_jour` : par clôture de caisse, expose `ca_jour`, `encaissements`, `encaissements_attendus`, `ecart`. C'est la traduction SQL de la règle métier ci-dessous.
- `v_solde_client` : solde dû par client.
- `v_chromes_jour` : agrégat des chromes par (date, employé).

### Multi-magasin (tenancy)

L'app est **multi-magasin** : table `magasins`, et **`magasin_id`** sur toutes les données (`users`, `clients`, `caisse_jour`, `chromes`, `promos`, `stocks`, `charges`, `fournisseurs`, `paiements_employes`, `comptes_autorises`). Migration : `supabase/migrations/2026-06-22-multi-magasin.sql` (le socle vit dans cette migration, appliquée par-dessus `schema.sql`/`policies.sql`). Principe :
- **1 magasin par compte** : `users.magasin_id`. `mon_magasin()` (SECURITY DEFINER) renvoie le magasin de l'appelant.
- Les colonnes `magasin_id` ont pour **défaut `public.mon_magasin()`** → les insertions le remplissent automatiquement, et la RLS ajoute partout `magasin_id = mon_magasin()`. Les composants existants n'ont donc **pas** eu besoin de changer (cloisonnement transparent).
- **Rôles** : `employe` < `admin` (gère son magasin) < `superadmin` (l'exploitant : crée magasins + admins via la page **Magasins**, garde l'admin de son propre magasin, mais ne voit pas les données clients des autres). `est_admin()` = rôle ∈ (`admin`,`superadmin`) ; `est_superadmin()` = rôle `superadmin`. Front : `estAdmin`, `estSuperadmin` (AuthProvider) ; garde `RequireSuperadmin`.
- Le trigger `handle_new_user` assigne `magasin_id` depuis `comptes_autorises` (donc l'admin/superadmin choisit le magasin en autorisant l'email).
- **Pilotage super-admin** (page `Magasins.jsx`, onglets Vue d'ensemble / Magasins / Codes / Messages) : `magasins.abonnement` (`essai`|`actif`|`suspendu`) + `essai_fin`. Un magasin `suspendu` ou en `essai` expiré **bloque** ses utilisateurs (`AuthProvider.magasinBloque` → `RequireAuth` affiche `AbonnementExpire`), sauf le superadmin ; l'admin bloqué peut toujours **exporter ses données** (`lib/exportMagasin.js`) et écrire au support. **Codes d'inscription** gérés en base (`codes_inscription`, générés depuis le pilotage ; l'Edge Function les valide). **Messagerie** (`messages`) : doléances admin↔superadmin (composant `Messagerie.jsx`, page `/support` côté magasin).

### Modèle RLS (sécurité — à comprendre avant toute modif de données)

La fonction `est_admin()` est `SECURITY DEFINER` (contourne la RLS de `users` pour éviter la récursion). Toutes les policies sont en plus **filtrées par `magasin_id = mon_magasin()`** (cf. multi-magasin). Logique de visibilité :
- **caisse_jour** et **paiements_employes** : un employé ne voit/gère QUE ses propres lignes ; l'admin voit tout. Les paiements ne sont créés/modifiés que par l'admin.
- **clients** et **chromes** : registre **partagé** en lecture/saisie entre tous les employés connectés — au comptoir, n'importe quel employé doit pouvoir encaisser le remboursement d'un client ou consulter sa dette. Toute ligne de chrome est attribuée à l'employé connecté (`employe_id = auth.uid()`).
- **users** : chacun voit son profil ; seul l'admin gère les comptes.

## Logique comptable CA/chromes — POINT CRITIQUE

Toute la règle métier sensible est centralisée dans **`src/lib/comptabilite.js`** (fonctions pures) et couverte par `src/lib/comptabilite.test.js`. **Ne pas dupliquer ces calculs dans les composants** : importer ces fonctions. La même logique est répliquée en SQL dans `v_ca_jour` — garder les deux cohérentes.

Un « chrome » = une avance (crédit) faite à un client.

- **CA du jour** = `CB + espèces + Σ avances du jour − Σ remboursements du jour`. À la saisie, l'employé entre **CB**, **espèces (Moro)** et les chromes ; le CA est **calculé automatiquement** (pas de champ « ventes directes » manuel). En base, `caisse_jour.ventes_directes` est stocké = `CB + espèces`, donc la vue `v_ca_jour` (`ca_jour = ventes_directes + avances − remboursements`) reste correcte sans changement de schéma.
- **Encaissements du jour** = `CB + espèces` (argent réellement entré ; le champ « Moro » de l'UI = espèces).
- **CA agrégé sur une période** (Comptabilité, Dashboard) = `Σ encaissements (clôtures) + Σ avances − Σ remboursements (TOUS les chromes de la période)`. Important : `v_ca_jour` ne produit une ligne que s'il existe une clôture ce jour-là, donc un chrome saisi un jour **sans clôture** (montant dû oublié, remboursement tardif) n'apparaîtrait pas. Les pages d'agrégation recomposent donc le CA par jour à partir des encaissements des clôtures **et** de la table `chromes` (jointure par date), sans double comptage : les jours « chromes seuls » sont affichés à part (Historique : « chromes uniquement » ; Dashboard : ligne « hors clôture »). L'intéressement reste, lui, attaché aux clôtures uniquement.
- **Solde client** = `Σ avances − Σ remboursements` (statut « Dette en cours » si > 0, sinon « Soldé »).
- **Pas de contrôle d'écart de caisse** : retiré à la demande du client (le CA découle directement de la caisse + chromes). `v_ca_jour.ecart`/`encaissements_attendus` et `reconciliation()` existent encore mais ne sont plus affichés.

**CA ≠ Encaissements dès qu'il y a des chromes** — les deux chiffres sont toujours affichés séparément, jamais confondus.

**Intéressement** : `interessement(ca, pourcentage, nbPersonnes=1) = (CA ÷ nbPersonnes) × % / 100` (arrondi au centime), répliqué dans `v_ca_jour`. **Le taux vient TOUJOURS du compte** (`users.pourcentage_interessement`, fixé par l'admin dans Comptes) et est lu **en direct** : `v_ca_jour` joint `users` et utilise `u.pourcentage_interessement` pour le propriétaire comme pour les co-participants — changer le taux dans Comptes recalcule immédiatement toutes les clôtures (pas de snapshot par clôture). Il n'y a **pas de champ % dans la Caisse** ; la colonne `caisse_jour.pourcentage_interessement` est conservée (recopiée à l'enregistrement) mais n'est plus la source du calcul. `caisse_jour.heures_travaillees` reste saisi (pour info, n'influe pas sur l'intéressement). La fonction `collegues()` renvoie aussi le taux de chaque collègue (affiché dans le sélecteur de journée partagée).

**Journées partagées** — deux modes :
- *Relais* (l'un après l'autre) : chaque employé saisit sa propre clôture (même date, `employe_id` différent) avec sa part de CA et ses heures.
- *Simultané, même caisse* (à parts égales) : **une seule** clôture saisie par un employé ; les collègues présents sont ajoutés dans `caisse_partage` (un par ligne, le propriétaire n'y figure pas). `v_ca_jour.nb_partageurs = 1 + count(caisse_partage)` (info), mais le **diviseur réel** de l'intéressement est `v_ca_jour.nb_interesses` = nombre de personnes présentes **au taux > 0** : un collègue à 0 % ne prend pas de part et ne dilue donc pas l'intéressement des autres (`/ nullif(nb_interesses, 0)`). La vue `v_interessement_employe` unifie les lignes d'intéressement (propriétaires + co-participants) pour l'Historique et le Dashboard. Le sélecteur de collègues appelle la fonction `collegues()` (SECURITY DEFINER, renvoie id+nom+taux — remplace l'ancienne vue `v_collegues` signalée « critique » par l'analyseur Supabase).

**Arithmétique en centimes** : tous les calculs passent par `enCentimes()` (entiers) pour éviter les erreurs de virgule flottante (`0,1 + 0,2`). Toute nouvelle somme de montants doit utiliser `somme()` plutôt qu'un `+` direct.

## Architecture du front

- `src/main.jsx` : monte `BrowserRouter` > `AuthProvider` > `App`.
- `src/auth/AuthProvider.jsx` : contexte d'auth. Expose `session`, `utilisateur`, `profil`, `estAdmin`, `chargement`, `connexion()`, `connexionGoogle()` (OAuth Google via Supabase), `deconnexion()`. Le rôle vient de la table `users`. Utiliser `useAuth()`. **Accès** : `RequireAuth` (Gardes.jsx) bloque les non-connectés ET les connectés **sans profil** (email non autorisé → écran « Accès non autorisé »). L'allowlist se gère dans **Comptes** ; côté base, `est_membre()` (SECURITY DEFINER = possède un profil) verrouille les registres partagés (clients/chromes/promos/stocks) pour qu'un compte non autorisé ne voie rien.
- `src/App.jsx` : routes. Tout est protégé par `RequireAuth` ; `/dashboard` et `/paiements` sont en plus derrière `RequireAdmin` (voir `src/components/Gardes.jsx`). `/connexion` est la page publique.
- `src/components/Layout.jsx` : en-tête + nav (liens admin conditionnés par `estAdmin`) + `<Outlet>`.
- `src/pages/` : un fichier par module — `Caisse.jsx` (clôture journalière), `Chromes.jsx` (avances/remboursements clients), `Historique.jsx` (clôtures de l'employé), `Paiements.jsx` (admin), `Dashboard.jsx` (admin, vue consolidée + export CSV/PDF), `Comptabilite.jsx` (admin, CA mois/semaine/année + charges/fournisseurs + bénéfice), `Journal.jsx` (admin, flux d'activité), `Comptes.jsx` (admin, gestion des comptes). `Comptabilite` calcule **bénéfice = CA − charges − fournisseurs** ; les tables `charges`/`fournisseurs` sont mensuelles (colonne `mois` = 1er du mois), réservées à l'admin (RLS), reprises d'un mois sur l'autre via un bouton. Chaque ligne peut porter un **justificatif** (photo de facture/ticket) : compression côté client (`src/lib/image.js`), stockage dans le bucket Supabase Storage privé **`justificatifs`** (politiques admin sur `storage.objects`), colonne `justificatif` = chemin du fichier, consultation via URL signée. **OCR** : `src/lib/ocr.js` (Tesseract.js chargé en import dynamique) lit le montant total du ticket pour pré-remplir la ligne ; `extraireMontant()` est pur et testé (`ocr.test.js`). Graphiques en **SVG natif** (pas de dépendance) dans `src/components/Graphiques.jsx` : `Courbe` (CA/jour), `Barres` (CA/semaine), `Camembert` (répartition des charges).
- `supabase/functions/creer-employe/` : Edge Function (Deno, slug déployé **`hyper-api`**) — trois usages : (1) `action:'inscription'` **publique** (onboarding self-service d'un magasin, protégée par le secret `CODE_INSCRIPTION` ; crée magasin + allowlist admin + compte) ; (2) `action:'reset'` (admin/superadmin) ; (3) défaut = création d'un compte employé/admin (admin/superadmin). Utilise la clé `service_role` (jamais exposée au front). Page publique `src/pages/Inscription.jsx` (route `/inscription`, lien depuis Login). Déploiement : `supabase functions deploy creer-employe`.
- `src/pages/Stocks.jsx` (accessible à tous, lien nav près de Chromes) : gestion d'inventaire. Table `stocks` (registre **partagé** : tout employé lit/crée/ajuste, suppression réservée admin via RLS) — `categorie`, `nom`, `quantite`, `unite`, `seuil_alerte`, `prix_achat`, `prix_vente`. Affichage groupé par catégorie, recherche, KPIs (nb produits, valeur du stock au prix d'achat, nb d'alertes), badges « Stock bas »/« Rupture » (quantité ≤ seuil), **mouvements rapides** entrée/sortie (+/−) et édition/suppression en ligne.
- L'ancien module Fiches de paie (`FichesPaie.jsx`, `bulletin.js`, `telechargerBulletinPaie`) n'est plus dans la nav ni le routing (retiré au profit des stocks) ; les fichiers restent présents si besoin de le réactiver.
- `src/pages/Import.jsx` (admin) : import de l'historique via CSV (caisse journalière, charges, fournisseurs) — modèle téléchargeable, aperçu/validation, upsert. Lecture CSV dans `src/lib/csv.js` (`parseCSVObjets`, auto-détection `;`/`,`), normalisation des dates dans `dates.js` (`normaliserDateISO`, `normaliserMoisISO`).
- `src/lib/` : `comptabilite.js` (logique métier), `bulletin.js` (calcul des bulletins de paie), `format.js` (euros/dates FR + `parseMontant`), `dates.js` (ISO local, intervalles jour/semaine/mois + normalisation), `csv.js` (lecture CSV), `image.js` (compression photos), `ocr.js` (Tesseract), `export.js` (CSV Excel via `telechargerCSV` + PDF via `telechargerPDF`/`telechargerBulletinPaie` avec jsPDF/autotable), `supabase.js` (client).

### Conventions front

- **Saisie de montants** : utiliser `<ChampMontant>` (`inputMode="decimal"`, clavier mobile). L'état reste une **string brute** pendant la frappe ; convertir avec `parseMontant()` au calcul et à l'enregistrement. Afficher avec `formatEuros()` / `formatNombre()`.
- **Format français** : virgule décimale en saisie et à l'affichage. `parseMontant` accepte `"1 234,56 €"`, `"12,50"`, `"12.5"`.
- **Accès données** : appels Supabase directs dans les composants (pas de couche service séparée). Les agrégats de lecture passent par les vues `v_*`. Filtrer par employé via `employe_id` ; la RLS fait respecter les droits côté serveur (ne pas s'y substituer côté client pour la sécurité).
- **Minimum de clics** : l'UX est pensée pour le comptoir mobile (formulaires courts, calculs en temps réel).
- **Brouillons** : les longs formulaires (Caisse, Fiches de paie) conservent leur saisie non enregistrée via `src/lib/brouillon.js` (sessionStorage) pour survivre au changement d'onglet. Garde-fou anti-écrasement : un `useRef(pret)` empêche d'écrire le brouillon avant la fin du chargement initial ; le brouillon est effacé après enregistrement.

### RGPD

Les clients ne sont **jamais** identifiés par leur nom/prénom réel. La table `clients` ne contient qu'un **`surnom`** et une **`description`** interne (repère pour le personnel, visible uniquement via la RLS), plus le solde calculé et des compteurs de **fidélité** (`tampons`, `recompenses`) — jamais de coordonnées ni d'identifiants personnels réels.

**Fidélité (carte à tampons)** : palier configurable par magasin (`magasins.fidelite_palier`, défaut 10). Le stamping se fait via des fonctions SECURITY DEFINER (`fidelite_ajouter`/`fidelite_retirer`/`fidelite_utiliser` — membres ; `fidelite_palier` — admin) pour autoriser les employés sans ouvrir l'édition de `clients` (réservée à l'admin), tout en restant cloisonné par magasin. UI dans la fiche client (Chromes). Migration : `supabase/migrations/2026-06-22-fidelite.sql`.

## État du projet

Application complète : schéma + RLS, auth par rôle, et tous les modules — Caisse, Chromes, Historique, Paiements, Dashboard (exports **CSV/Excel et PDF**), Journal (flux d'activité) et Comptes (gestion + création via Edge Function). Le journal est dérivé des `created_at`/`employe_id` existants (pas de table de logs redondante).
