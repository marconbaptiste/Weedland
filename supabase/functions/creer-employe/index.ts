// Edge Function : création de comptes + inscription self-service d'un magasin.
// Déploiement : `supabase functions deploy creer-employe` (slug : creer-employe).
//
// Trois usages :
//  - action 'inscription' : PUBLIC (pas d'auth). Crée un magasin + son admin,
//    protégé par un code secret (Deno.env CODE_INSCRIPTION). Anti-spam.
//  - action 'reset' : admin/superadmin — réinitialise le mot de passe d'un employé.
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
    // 1) Inscription self-service d'un magasin (PUBLIC, protégée par un code).
    // ----------------------------------------------------------------------
    if (corps.action === 'inscription') {
      const admin = createClient(url, serviceRole);
      const codeSaisi = String(corps.code ?? '').trim();
      const codeEnv = (Deno.env.get('CODE_INSCRIPTION') ?? '').trim();
      const nomMagasin = String(corps.nomMagasin ?? '').trim().slice(0, 80);
      const nom = String(corps.nom ?? '').trim().slice(0, 80);
      const email = String(corps.email ?? '').trim().toLowerCase();
      const motDePasse = String(corps.motDePasse ?? '');
      // 1) Valider la saisie AVANT de consommer le code (un code n'est jamais
      //    brûlé par une simple faute de frappe).
      if (!nomMagasin || !nom || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: 'Magasin, nom et email (valide) sont requis.' }, 400);
      }
      if (motDePasse.length < 8) {
        return json({ error: 'Mot de passe trop court (8 caractères minimum).' }, 400);
      }
      if (!codeSaisi) return json({ error: 'Code d’inscription invalide ou épuisé.' }, 403);
      if (corps.cgv !== true) {
        return json({ error: 'L’acceptation des CGV, CGU et de la politique de confidentialité est requise.' }, 400);
      }
      const cgvVersion = String(corps.cgvVersion ?? '').trim().slice(0, 20) || 'inconnue';
      // Email déjà autorisé (donc déjà rattaché à un magasin) ?
      const { data: deja } = await admin
        .from('comptes_autorises')
        .select('email')
        .eq('email', email)
        .maybeSingle();
      if (deja) {
        return json({ error: 'Cet email a déjà un magasin. Connecte-toi (ou « mot de passe oublié »).' }, 400);
      }

      // 2) Code valide s'il = secret env (code maître de l'exploitant) OU s'il est
      //    CONSOMMÉ atomiquement dans codes_inscription (respecte plafond/expiration
      //    → ferme la création de masse via un code fuité).
      let codeValide = false;
      let codeConsomme = false;
      if (codeEnv && codeSaisi === codeEnv) {
        codeValide = true;
      } else {
        const { data: ok } = await admin.rpc('consommer_code_inscription', { p_code: codeSaisi });
        codeValide = ok === true;
        codeConsomme = codeValide;
      }
      if (!codeValide) {
        return json({ error: 'Code d’inscription invalide ou épuisé.' }, 403);
      }

      // 3) Création : magasin → allowlist → compte. Chaque étape suivante qui
      //    échoue ANNULE les précédentes (pas de magasin orphelin, pas d'email
      //    verrouillé, code restitué) : le commerçant peut simplement réessayer.
      let magasinId: string | null = null;
      const annuler = async () => {
        if (magasinId) {
          await admin.from('comptes_autorises').delete().eq('email', email).eq('magasin_id', magasinId);
          await admin.from('magasins').delete().eq('id', magasinId);
        }
        if (codeConsomme) await admin.rpc('rendre_code_inscription', { p_code: codeSaisi });
      };
      const { data: mag, error: errMag } = await admin
        .from('magasins')
        .insert({ nom: nomMagasin, cgv_version: cgvVersion, cgv_acceptees_le: new Date().toISOString() })
        .select('id')
        .single();
      if (errMag || !mag) {
        await annuler();
        console.error('inscription magasin:', errMag);
        return json({ error: 'Création du magasin impossible. Réessaie dans un instant.' }, 500);
      }
      magasinId = mag.id;

      const { error: errAuth } = await admin
        .from('comptes_autorises')
        .insert({ email, role: 'admin', magasin_id: mag.id });
      if (errAuth) {
        await annuler();
        console.error('inscription allowlist:', errAuth);
        return json({ error: 'Création du compte impossible. Réessaie dans un instant.' }, 500);
      }

      // Compte Supabase Auth déjà existant pour cet email (ex. 1re connexion
      // Google avant l'inscription) : on ne touche pas à son mot de passe (on
      // n'a aucune preuve que l'appelant possède cet email). L'email est
      // maintenant autorisé en admin du nouveau magasin : à sa prochaine
      // connexion, `reclamer_profil()` lui crée son profil (AuthProvider).
      const { data: existe } = await admin.rpc('auth_email_existe', { p_email: email });
      if (existe === true) {
        return json({ ok: true, compteExistant: true }, 200);
      }

      // Créer le compte (le trigger handle_new_user crée le profil admin + magasin).
      const { error: errUser } = await admin.auth.admin.createUser({
        email,
        password: motDePasse,
        email_confirm: true,
        user_metadata: { nom, role: 'admin' },
      });
      if (errUser) {
        await annuler();
        console.error('inscription createUser:', errUser);
        const msg = /password/i.test(errUser.message)
          ? 'Mot de passe refusé : choisis-en un plus long ou plus varié.'
          : 'Création du compte impossible. Réessaie dans un instant.';
        return json({ error: msg }, 400);
      }

      return json({ ok: true }, 200);
    }

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
      .single();
    if (profil?.actif === false) return json({ error: 'Compte désactivé' }, 403);
    if (profil?.role !== 'admin' && profil?.role !== 'superadmin') {
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
