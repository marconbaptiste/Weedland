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
4. Créer les comptes employés via Supabase Auth. Un profil `users` est créé automatiquement (rôle `employe`). Pour passer un compte en admin :
   ```sql
   update public.users set role = 'admin' where id = '<uuid-utilisateur>';
   ```

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
