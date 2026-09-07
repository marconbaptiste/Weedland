# Emails de l'application — configuration (Resend + Supabase)

## Pourquoi c'est indispensable

Supabase envoie des emails à tes utilisateurs : **confirmation d'adresse à
l'inscription** (c'est ce qui prouve qu'un commerçant possède bien son email et
ce qui crée son magasin), **mot de passe oublié**, invitation. Par défaut Supabase
utilise son propre serveur d'envoi de test : **2 à 4 emails par heure maximum**,
expéditeur `noreply@mail.app.supabase.io`, souvent classé en spam. Avec
l'inscription publique, le 3ᵉ commerçant de l'heure ne recevrait rien.

Il faut donc brancher un **service d'envoi d'emails** (« SMTP »). **Resend** est
le plus simple : gratuit jusqu'à 3 000 emails/mois, aucun code à écrire.
(Brevo, ex-Sendinblue, est l'équivalent français, gratuit 300 emails/jour ; la
procédure est la même, seuls l'hôte et le mot de passe changent.)

## Étape 1 — Créer le compte Resend (5 min)

1. https://resend.com → **Sign up** (avec ton email Google, c'est le plus rapide).
2. Menu **Domains** → **Add domain** → tape `kanabiz.dev` → région **Europe (eu-west-1)**.
3. Resend affiche **3 enregistrements DNS** à ajouter (2 de type `TXT` pour DKIM/SPF,
   1 de type `MX`). Laisse cette page ouverte.

## Étape 2 — Ajouter les enregistrements DNS (5 min)

Le DNS de `kanabiz.dev` est géré là où tu as acheté le domaine (Vercel si tu l'as
pris via Vercel : **Vercel → Domains → kanabiz.dev → DNS Records**).

Pour chaque ligne affichée par Resend : **Add record** → recopie **Type**,
**Name** (ex. `resend._domainkey`) et **Value** exactement. Retourne sur Resend
→ **Verify** ; le statut passe à *Verified* en quelques minutes (parfois 1 h).

## Étape 3 — Créer la clé d'envoi (1 min)

Resend → **API Keys** → **Create API key** → nom `supabase`, permission
**Sending access**, domaine `kanabiz.dev` → copie la clé (`re_…`) — elle ne sera
plus affichée.

## Étape 4 — Brancher Supabase (3 min)

Supabase → **Authentication → Emails → SMTP Settings** → **Enable Custom SMTP** :

| Champ | Valeur |
|---|---|
| Sender email | `noreply@kanabiz.dev` |
| Sender name | `Kanabiz` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | la clé `re_…` de l'étape 3 |

**Save**. Juste en dessous, monte **Rate limits → Emails sent per hour** à `100`
(la limite de 4/h ne s'applique qu'au serveur de test).

## Étape 5 — Réglages d'authentification (2 min)

Supabase → **Authentication → Providers → Email** :
- **Confirm email : ON** (obligatoire : c'est la preuve d'identité de l'inscription
  publique ; sans confirmation, aucun profil n'est jamais créé).
- **Allow new users to sign up : ON** (inscription publique).
- **Minimum password length : 8**.
- **Leaked password protection : ON** (refuse les mots de passe déjà fuités).

Supabase → **Authentication → URL Configuration** :
- **Site URL** : `https://kanabiz.dev`
- **Redirect URLs** : ajouter `https://kanabiz.dev/**`
  (et `http://localhost:5173/**` pour le développement).

## Étape 6 — Personnaliser les emails (5 min, recommandé)

Supabase → **Authentication → Emails → Templates**. Textes proposés :

**Confirm signup** — objet : `Confirme ton adresse pour ouvrir ton magasin Kanabiz`
```html
<h2>Bienvenue sur Kanabiz 👋</h2>
<p>Clique sur le bouton ci-dessous pour confirmer ton adresse : ton magasin sera créé
et tu arriveras directement dans l'application (14 jours d'essai gratuit).</p>
<p><a href="{{ .ConfirmationURL }}">Confirmer mon adresse et ouvrir mon magasin</a></p>
<p>Si tu n'es pas à l'origine de cette demande, ignore simplement cet email.</p>
```

**Reset password** — objet : `Réinitialise ton mot de passe Kanabiz`
```html
<h2>Mot de passe oublié ?</h2>
<p>Clique ici pour en choisir un nouveau (lien valable 1 heure) :</p>
<p><a href="{{ .ConfirmationURL }}">Choisir un nouveau mot de passe</a></p>
<p>Si tu n'as rien demandé, ignore cet email : ton mot de passe reste inchangé.</p>
```

## Étape 7 — Tester (2 min)

1. Ouvre `https://kanabiz.dev/inscription` en navigation privée, inscris-toi avec une
   adresse à toi (pas celle du superadmin).
2. L'email doit arriver en moins d'une minute, expéditeur `Kanabiz <noreply@kanabiz.dev>`.
3. Clique le lien : tu dois atterrir dans l'app avec un magasin neuf en essai.
4. Depuis le compte superadmin, supprime ce magasin de test (Pilotage).

## Anti-robots (optionnel, recommandé)

Cloudflare Turnstile est gratuit : https://dash.cloudflare.com → **Turnstile →
Add site** (domaine `kanabiz.dev`, mode *Managed*). Tu obtiens une **Site key**
(publique) et une **Secret key**.
- Supabase → Authentication → **Bot and Abuse Protection** → Enable → Turnstile →
  colle la **Secret key**.
- Vercel → variable d'environnement `VITE_TURNSTILE_SITE_KEY` = la **Site key**,
  puis redéploie. Le widget apparaît sur la page d'inscription.

## En cas de problème

- « Email rate limit exceeded » : le SMTP custom n'est pas activé ou la limite
  horaire est restée à 4.
- L'email arrive en spam : les 3 enregistrements DNS ne sont pas tous *Verified*.
- Le lien renvoie sur la page de connexion sans créer le magasin : `Redirect URLs`
  ne contient pas `https://kanabiz.dev/**`.
