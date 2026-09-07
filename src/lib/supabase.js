import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const cleAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Indique si la configuration est présente. Si elle manque, on n'instancie pas
// le client (createClient planterait) : l'app affiche un message dédié plutôt
// qu'un écran blanc (voir main.jsx + ConfigManquante).
export const configSupabaseOk = Boolean(url && cleAnon);

// `cache: 'no-store'` sur toutes les requêtes : évite que le navigateur ressorte
// une réponse en cache (données périmées) après un enregistrement, ce qui
// donnait l'impression que les autres onglets « ne suivaient pas ».
//
// On retente automatiquement les LECTURES (GET) en cas d'erreur réseau
// passagère ou de réponse 5xx/429 : c'est la principale cause des « erreurs de
// chargement ». Les écritures (POST/PATCH/DELETE) ne sont jamais retentées
// automatiquement pour éviter tout doublon.
const ATTENTES = [300, 800, 1600]; // ms, backoff progressif

async function fetchAvecReprise(input, init = {}) {
  const methode = (init.method ?? 'GET').toUpperCase();
  const options = { ...init, cache: 'no-store' };
  const retentable = methode === 'GET';
  for (let essai = 0; ; essai += 1) {
    try {
      const reponse = await fetch(input, options);
      const aReessayer = reponse.status >= 500 || reponse.status === 429;
      if (retentable && aReessayer && essai < ATTENTES.length) {
        await new Promise((r) => setTimeout(r, ATTENTES[essai]));
        continue;
      }
      return reponse;
    } catch (e) {
      if (!retentable || essai >= ATTENTES.length) throw e;
      await new Promise((r) => setTimeout(r, ATTENTES[essai]));
    }
  }
}

export const supabase = configSupabaseOk
  ? createClient(url, cleAnon, {
      global: { fetch: fetchAvecReprise },
    })
  : null;

// PostgREST plafonne chaque réponse à 1 000 lignes SANS erreur : au-delà, une
// somme calculée côté client (CA annuel, créances) serait silencieusement
// fausse. `lireTout` enchaîne les pages jusqu'à épuisement. La requête DOIT
// porter un `.order()` stable (ex. 'id') pour que les pages ne se chevauchent pas.
export async function lireTout(requete, taille = 1000) {
  const tout = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await requete.range(page * taille, (page + 1) * taille - 1);
    if (error) return { data: tout, error };
    tout.push(...(data ?? []));
    if (!data || data.length < taille) return { data: tout, error: null };
  }
}
