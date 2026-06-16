import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const cleAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Indique si la configuration est présente. Si elle manque, on n'instancie pas
// le client (createClient planterait) : l'app affiche un message dédié plutôt
// qu'un écran blanc (voir main.jsx + ConfigManquante).
export const configSupabaseOk = Boolean(url && cleAnon);

export const supabase = configSupabaseOk ? createClient(url, cleAnon) : null;
