// Edge Function : création de comptes + inscription self-service d'un magasin.
// Déploiement : `supabase functions deploy creer-employe` (slug déployé : hyper-api).
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
      // Code valide s'il existe (actif) dans codes_inscription OU = secret env.
      const { data: codeRow } = await admin
        .from('codes_inscription')
        .select('code, utilisations')
        .eq('code', codeSaisi)
        .eq('actif', true)
        .maybeSingle();
      if (!codeSaisi || (!codeRow && codeSaisi !== codeEnv)) {
        return json({ error: 'Code d’inscription invalide.' }, 403);
      }
      const nomMagasin = String(corps.nomMagasin ?? '').trim();
      const nom = String(corps.nom ?? '').trim();
      const email = String(corps.email ?? '').trim().toLowerCase();
      const motDePasse = String(corps.motDePasse ?? '');
      if (!nomMagasin || !nom || !email) {
        return json({ error: 'Magasin, nom et email sont requis.' }, 400);
      }
      if (motDePasse.length < 8) {
        return json({ error: 'Mot de passe trop court (8 caractères minimum).' }, 400);
      }

      // Email déjà autorisé / utilisé ?
      const { data: deja } = await admin
        .from('comptes_autorises')
        .select('email')
        .eq('email', email)
        .maybeSingle();
      if (deja) return json({ error: 'Cet email est déjà utilisé.' }, 400);

      // Créer le magasin (service_role => contourne la RLS).
      const { data: mag, error: errMag } = await admin
        .from('magasins')
        .insert({ nom: nomMagasin })
        .select('id')
        .single();
      if (errMag || !mag) return json({ error: errMag?.message ?? 'Création du magasin impossible' }, 400);

      // Autoriser l'email en admin de ce magasin.
      const { error: errAuth } = await admin
        .from('comptes_autorises')
        .insert({ email, role: 'admin', magasin_id: mag.id });
      if (errAuth) return json({ error: errAuth.message }, 400);

      // Créer le compte (le trigger crée le profil admin + magasin).
      const { error: errUser } = await admin.auth.admin.createUser({
        email,
        password: motDePasse,
        email_confirm: true,
        user_metadata: { nom, role: 'admin' },
      });
      if (errUser) return json({ error: errUser.message }, 400);

      if (codeRow) {
        await admin
          .from('codes_inscription')
          .update({ utilisations: (codeRow.utilisations ?? 0) + 1 })
          .eq('code', codeSaisi);
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
      .select('role, magasin_id')
      .eq('id', user.id)
      .single();
    if (profil?.role !== 'admin' && profil?.role !== 'superadmin') {
      return json({ error: 'Accès réservé aux administrateurs' }, 403);
    }

    // 2a. Suppression d'un magasin et de toutes ses données (super-admin).
    if (corps.action === 'supprimer-magasin') {
      if (profil.role !== 'superadmin') return json({ error: 'Réservé au super-admin' }, 403);
      const magasinId = String(corps.magasinId ?? '');
      if (!magasinId) return json({ error: 'magasinId requis' }, 400);
      const { data: moi } = await admin.from('users').select('magasin_id').eq('id', user.id).single();
      if (moi?.magasin_id === magasinId) {
        return json({ error: 'Bascule sur un autre magasin avant de supprimer celui-ci.' }, 400);
      }
      const tables = ['caisse_jour', 'chromes', 'promos', 'stocks', 'charges', 'fournisseurs', 'paiements_employes', 'clients'];
      for (const t of tables) {
        const { error: errDel } = await admin.from(t).delete().eq('magasin_id', magasinId);
        if (errDel) return json({ error: `${t}: ${errDel.message}` }, 400);
      }
      const { data: membres } = await admin.from('users').select('id').eq('magasin_id', magasinId);
      for (const membre of membres ?? []) {
        await admin.auth.admin.deleteUser(membre.id);
      }
      await admin.from('comptes_autorises').delete().eq('magasin_id', magasinId);
      const { error: errMag } = await admin.from('magasins').delete().eq('id', magasinId);
      if (errMag) return json({ error: errMag.message }, 400);
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
