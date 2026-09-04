// Edge Function : création de comptes + inscription self-service d'un magasin.
// Déploiement : `supabase functions deploy creer-employe` (slug : creer-employe).
//
// Usages :
//  - action 'creer-magasin' : compte CONNECTÉ dont l'email est CONFIRMÉ et qui
//    n'a pas encore de profil (inscription publique : le front fait
//    auth.signUp → email de confirmation → à la 1re connexion on crée le
//    magasin + le profil admin). Preuve de possession de l'email = la
//    confirmation Supabase Auth ; 1 magasin par email ; plafond global/jour.
//  - action 'reset' : admin/superadmin — réinitialise le mot de passe d'un employé.
//  - action 'desactiver-compte' / 'reactiver-compte' : offboarding.
//  - action 'supprimer-magasin' : super-admin.
//  - défaut : admin/superadmin — crée un compte employé/admin.
//
// Le trigger handle_new_user (schema) crée le profil public.users à partir de
// l'allowlist comptes_autorises (rôle + magasin_id) et des user_metadata (nom).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const corps = await req.json();

    // ----------------------------------------------------------------------
    // 2) Reste : réservé aux administrateurs (et super-admin).
    // ----------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization') ?? '';
    const clientAppelant = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: errUser,
    } = await clientAppelant.auth.getUser();
    if (errUser || !user) return json({ error: 'Non authentifié' }, 401);

    const admin = createClient(url, serviceRole);
    const { data: profil } = await admin
      .from('users')
      .select('role, magasin_id, actif')
      .eq('id', user.id)
      .maybeSingle();
    if (profil?.actif === false) return json({ error: 'Compte désactivé' }, 403);

    // ----------------------------------------------------------------------
    // 1) Inscription publique — création du magasin par un compte confirmé.
    // ----------------------------------------------------------------------
    if (corps.action === 'creer-magasin') {
      if (profil) return json({ error: 'Ce compte a déjà un magasin.' }, 400);
      if (!user.email_confirmed_at && !user.confirmed_at) {
        return json({ error: 'Confirme d’abord ton adresse email (lien reçu par email).' }, 403);
      }
      const email = String(user.email ?? '').toLowerCase();
      const meta = user.user_metadata ?? {};
      const nomMagasin = String(corps.nomMagasin ?? meta.nomMagasin ?? '').trim().slice(0, 80);
      const nom = String(corps.nom ?? meta.nom ?? meta.full_name ?? meta.name ?? email.split('@')[0]).trim().slice(0, 80);
      const cgvVersion = String(corps.cgvVersion ?? meta.cgvVersion ?? '').trim().slice(0, 20);
      if (!nomMagasin) return json({ error: 'Le nom du magasin est requis.' }, 400);
      if (!cgvVersion) return json({ error: 'L’acceptation des CGV est requise.' }, 400);
      // Email déjà rattaché à un magasin (autorisé par un admin) ? → le profil se
      // crée par reclamer_profil(), pas ici.
      const { data: deja } = await admin.from('comptes_autorises').select('magasin_id').eq('email', email).maybeSingle();
      if (deja) return json({ error: 'Cet email est déjà rattaché à un magasin : reconnecte-toi.' }, 400);
      // Plafond global anti-création de masse (bots) : 40 nouveaux magasins / jour.
      const depuis = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count } = await admin.from('magasins').select('id', { count: 'exact', head: true }).gte('created_at', depuis);
      if ((count ?? 0) >= 40) {
        console.error('creer-magasin: plafond quotidien atteint');
        return json({ error: 'Trop d’inscriptions aujourd’hui, réessaie demain.' }, 429);
      }

      const { data: mag, error: errMag } = await admin
        .from('magasins')
        .insert({ nom: nomMagasin, cgv_version: cgvVersion, cgv_acceptees_le: new Date().toISOString() })
        .select('id')
        .single();
      if (errMag || !mag) {
        console.error('creer-magasin magasin:', errMag);
        return json({ error: 'Création du magasin impossible. Réessaie dans un instant.' }, 500);
      }
      const { error: errAuth } = await admin
        .from('comptes_autorises')
        .insert({ email, role: 'admin', magasin_id: mag.id });
      const { error: errProfil } = errAuth
        ? { error: errAuth }
        : await admin.from('users').insert({
            id: user.id,
            nom,
            role: 'admin',
            pourcentage_interessement: 0,
            magasin_id: mag.id,
            email,
          });
      if (errProfil) {
        await admin.from('comptes_autorises').delete().eq('email', email).eq('magasin_id', mag.id);
        await admin.from('magasins').delete().eq('id', mag.id);
        console.error('creer-magasin profil:', errProfil);
        return json({ error: 'Création du compte impossible. Réessaie dans un instant.' }, 500);
      }
      return json({ ok: true, magasinId: mag.id }, 200);
    }

    if (!profil || (profil.role !== 'admin' && profil.role !== 'superadmin')) {
      return json({ error: 'Accès réservé aux administrateurs' }, 403);
    }

    // 2a. Suppression d'un magasin et de toutes ses données (super-admin).
    //     Purge SQL transactionnelle (magasin_purger : toutes les tables dans
    //     l'ordre des dépendances), puis comptes Auth et fichiers Storage.
    if (corps.action === 'supprimer-magasin') {
      if (profil.role !== 'superadmin') return json({ error: 'Réservé au super-admin' }, 403);
      const magasinId = String(corps.magasinId ?? '');
      if (!magasinId) return json({ error: 'magasinId requis' }, 400);
      const { data: moi } = await admin.from('users').select('magasin_id').eq('id', user.id).single();
      if (moi?.magasin_id === magasinId) {
        return json({ error: 'Bascule sur un autre magasin avant de supprimer celui-ci.' }, 400);
      }
      const { data: membres } = await admin.from('users').select('id, role').eq('magasin_id', magasinId);
      if ((membres ?? []).some((m) => m.role === 'superadmin')) {
        return json({ error: 'Ce magasin héberge un compte superadmin : déplace-le d’abord.' }, 400);
      }
      const { error: errPurge } = await admin.rpc('magasin_purger', { p_id: magasinId });
      if (errPurge) {
        console.error('supprimer-magasin purge:', errPurge);
        return json({ error: 'Suppression impossible (données). Rien n’a été supprimé.' }, 500);
      }
      for (const membre of membres ?? []) {
        const { error: errDel } = await admin.auth.admin.deleteUser(membre.id);
        if (errDel) console.error('supprimer-magasin deleteUser:', membre.id, errDel.message);
      }
      // Fichiers : justificatifs/<magasin>/… et logos/<magasin>/…
      for (const bucket of ['justificatifs', 'logos']) {
        try {
          const chemins: string[] = [];
          const { data: dossiers } = await admin.storage.from(bucket).list(magasinId, { limit: 1000 });
          for (const d of dossiers ?? []) {
            if (d.id) {
              chemins.push(`${magasinId}/${d.name}`);
            } else {
              const { data: fichiers } = await admin.storage.from(bucket).list(`${magasinId}/${d.name}`, { limit: 1000 });
              for (const f of fichiers ?? []) chemins.push(`${magasinId}/${d.name}/${f.name}`);
            }
          }
          if (chemins.length) await admin.storage.from(bucket).remove(chemins);
        } catch (e) {
          console.error('supprimer-magasin storage', bucket, e);
        }
      }
      return json({ ok: true }, 200);
    }

    // 2b. Désactivation / réactivation d'un compte employé (offboarding).
    //     Désactiver = bannir le compte Auth (plus de connexion ni de refresh)
    //     + users.actif=false (est_membre()/est_admin() → toute la RLS refuse
    //     immédiatement, même avec un JWT encore valide) + retrait de l'allowlist.
    //     Le profil est conservé (historique des clôtures/chromes référencé).
    if (corps.action === 'desactiver-compte' || corps.action === 'reactiver-compte') {
      const userId = String(corps.userId ?? '');
      if (!userId) return json({ error: 'userId requis' }, 400);
      if (userId === user.id) return json({ error: 'Impossible sur son propre compte.' }, 400);
      const { data: cible } = await admin.from('users').select('magasin_id, role, email').eq('id', userId).single();
      if (!cible || cible.role === 'superadmin') return json({ error: 'Compte introuvable' }, 404);
      if (profil.role !== 'superadmin' && cible.magasin_id !== profil.magasin_id) {
        return json({ error: 'Compte hors de votre magasin' }, 403);
      }
      const desactiver = corps.action === 'desactiver-compte';
      const { error: errBan } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: desactiver ? '876600h' : 'none',
      });
      if (errBan) {
        console.error('desactiver-compte ban:', errBan);
        return json({ error: 'Opération impossible. Réessaie.' }, 500);
      }
      await admin.from('users').update({ actif: !desactiver }).eq('id', userId);
      if (desactiver && cible.email) {
        await admin.from('comptes_autorises').delete().eq('email', cible.email).eq('magasin_id', cible.magasin_id);
      } else if (!desactiver && cible.email) {
        await admin
          .from('comptes_autorises')
          .upsert({ email: cible.email, role: cible.role === 'admin' ? 'admin' : 'employe', magasin_id: cible.magasin_id }, { onConflict: 'email' });
      }
      return json({ ok: true }, 200);
    }

    // 2a. Réinitialisation du mot de passe d'un employé.
    if (corps.action === 'reset') {
      const { userId, motDePasse: nouveau } = corps;
      if (!userId || !nouveau) return json({ error: 'Champs requis : userId, motDePasse' }, 400);
      // Un admin ne peut réinitialiser QUE les comptes de SON magasin, et jamais
      // un superadmin. Le superadmin, lui, peut viser n'importe quel compte.
      if (profil.role !== 'superadmin') {
        const { data: cible } = await admin
          .from('users')
          .select('magasin_id, role')
          .eq('id', userId)
          .single();
        if (!cible || cible.magasin_id !== profil.magasin_id || cible.role === 'superadmin') {
          return json({ error: 'Compte hors de votre magasin' }, 403);
        }
      }
      const { error: errReset } = await admin.auth.admin.updateUserById(userId, {
        password: nouveau,
      });
      if (errReset) return json({ error: errReset.message }, 400);
      return json({ ok: true }, 200);
    }

    // 2b. Créer le compte.
    const { email, motDePasse, nom, role, pourcentage } = corps;
    if (!email || !motDePasse || !nom) {
      return json({ error: 'Champs requis : nom, email, mot de passe' }, 400);
    }
    if (String(motDePasse).length < 8) {
      return json({ error: 'Mot de passe trop court (8 caractères minimum).' }, 400);
    }
    // Cloisonnement : un admin (non superadmin) ne peut créer un compte que pour
    // un email AUTORISÉ DANS SON magasin. Sans ce contrôle, un admin pouvait
    // provisionner (avec un mot de passe qu'il choisit) un email inscrit dans
    // l'allowlist d'un AUTRE magasin → prise de contrôle inter-tenant.
    const emailCible = String(email).trim().toLowerCase();
    if (profil.role !== 'superadmin') {
      const { data: allow } = await admin
        .from('comptes_autorises')
        .select('magasin_id')
        .eq('email', emailCible)
        .maybeSingle();
      if (!allow || allow.magasin_id !== profil.magasin_id) {
        return json({ error: 'Cet email doit d’abord être autorisé dans votre magasin.' }, 403);
      }
    }
    const taux = Number(String(pourcentage ?? '0').replace(',', '.')) || 0;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: motDePasse,
      email_confirm: true,
      user_metadata: {
        nom,
        role: role === 'admin' ? 'admin' : 'employe',
        pourcentage_interessement: taux,
      },
    });
    if (error) return json({ error: error.message }, 400);

    return json({ id: data.user?.id }, 200);
  } catch (e) {
    console.error('creer-employe:', e);
    return json({ error: 'Erreur interne.' }, 500);
  }
});
