import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const cleAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !cleAnon) {
  // Message explicite plutôt qu'une erreur cryptique de createClient.
  throw new Error(
    'Configuration Supabase manquante : renseignez VITE_SUPABASE_URL et ' +
      'VITE_SUPABASE_ANON_KEY dans un fichier .env (voir .env.example).',
  );
}

export const supabase = createClient(url, cleAnon);
