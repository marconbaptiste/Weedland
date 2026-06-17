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
export const supabase = configSupabaseOk
  ? createClient(url, cleAnon, {
      global: {
        fetch: (input, init = {}) => fetch(input, { ...init, cache: 'no-store' }),
      },
    })
  : null;
