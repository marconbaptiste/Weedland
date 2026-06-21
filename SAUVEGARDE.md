# Sauvegardes de la base

Sauvegarde quotidienne automatique de la base Supabase via GitHub Actions
(`.github/workflows/sauvegarde.yml`). Le dump est **chiffré** puis stocké en
**artefact GitHub** (30 jours).

## Mise en place (une fois)

Dans GitHub → le dépôt → **Settings → Secrets and variables → Actions → New repository secret**, créer :

| Nom | Valeur |
|-----|--------|
| `SUPABASE_DB_URL` | la chaîne de connexion Postgres **Session pooler** (Supabase → Connect → URI, port `5432`), avec le vrai mot de passe |
| `BACKUP_PASSPHRASE` | un mot de passe **fort** que tu gardes précieusement (il sert à déchiffrer ; sans lui, la sauvegarde est illisible) |

> ⚠️ Garde `BACKUP_PASSPHRASE` ailleurs (gestionnaire de mots de passe). Si tu le perds, les sauvegardes sont irrécupérables — c'est le but du chiffrement.

## Lancer une sauvegarde manuelle

GitHub → onglet **Actions** → workflow **« Sauvegarde base »** → **Run workflow**.

## Récupérer une sauvegarde

GitHub → **Actions** → ouvrir une exécution → section **Artifacts** → télécharger
`sauvegarde-weedland` (contient `weedland-AAAAMMJJ-HHMMSS.sql.enc`).

## Restaurer

Sur un ordinateur avec `postgresql-client` et `openssl` :

```bash
# 1. Déchiffrer
openssl enc -d -aes-256-cbc -pbkdf2 -in weedland-XXXX.sql.enc -out dump.pgcustom -pass pass:'TON_PASSPHRASE'

# 2. Restaurer dans une base (ex. une base de test ou un nouveau projet)
pg_restore --no-owner --no-privileges -d "postgresql://...:5432/postgres" dump.pgcustom
```

> Pour une restauration en production, fais-toi accompagner : un restore écrase
> des données. Teste d'abord sur une base vide.

## Limites / pistes

- Les artefacts expirent après **30 jours** (modifiable dans le workflow). Pour
  une conservation longue, télécharge une sauvegarde par mois et archive-la.
- Pour des sauvegardes managées + restauration en 1 clic + Point-in-Time
  Recovery, passer au plan **Supabase Pro** le moment venu.
