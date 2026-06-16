// Edge Function : création d'un compte employé/admin.
// Réservée aux administrateurs. Utilise la clé service_role (jamais exposée au
// front). Déploiement : `supabase functions deploy creer-employe`.
//
// Le trigger handle_new_user (schema.sql) crée automatiquement le profil
// public.users à partir des user_metadata (nom, role) passés ici.
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
    const authHeader = req.headers.get('Authorization') ?? '';

    // 1. Identifier l'appelant via son JWT.
    const clientAppelant = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: errUser,
    } = await clientAppelant.auth.getUser();
    if (errUser || !user) return json({ error: 'Non authentifié' }, 401);

    // 2. Vérifier qu'il est admin (lecture avec service_role).
    const admin = createClient(url, serviceRole);
    const { data: profil } = await admin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profil?.role !== 'admin') {
      return json({ error: 'Accès réservé aux administrateurs' }, 403);
    }

    const corps = await req.json();

    // 3 bis. Réinitialisation du mot de passe d'un employé.
    if (corps.action === 'reset') {
      const { userId, motDePasse: nouveau } = corps;
      if (!userId || !nouveau) return json({ error: 'Champs requis : userId, motDePasse' }, 400);
      const { error: errReset } = await admin.auth.admin.updateUserById(userId, {
        password: nouveau,
      });
      if (errReset) return json({ error: errReset.message }, 400);
      return json({ ok: true }, 200);
    }

    // 3. Créer le compte.
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
    return json({ error: String(e) }, 500);
  }
});
