// Traduit une erreur Supabase/PostgREST (souvent en anglais et technique) en un
// message court en français, exploitable par un commerçant sans support.
// Les codes viennent de PostgreSQL (SQLSTATE) et de PostgREST.
const PAR_CODE = {
  23505: 'Cette entrée existe déjà (doublon).',
  23514: 'Valeur refusée (montant négatif ou hors limites).',
  23503: 'Impossible : cet élément est encore utilisé ailleurs.',
  23502: 'Un champ obligatoire est vide.',
  42501: 'Action non autorisée pour ton compte.',
  PGRST116: 'Élément introuvable (déjà supprimé ?).',
  PGRST301: 'Session expirée : reconnecte-toi.',
  '57014': 'La demande a pris trop de temps, réessaie.',
};

export function messageErreur(erreur, defaut = 'Une erreur est survenue, réessaie.') {
  if (!erreur) return defaut;
  const code = String(erreur.code ?? '');
  if (PAR_CODE[code]) return PAR_CODE[code];
  const m = String(erreur.message ?? '');
  if (/row-level security/i.test(m)) return 'Action non autorisée pour ton compte.';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return 'Pas de connexion : vérifie le réseau et réessaie.';
  if (/JWT|expired|invalid token/i.test(m)) return 'Session expirée : reconnecte-toi.';
  if (/TOKEN_PERIME/.test(m)) return 'QR périmé : demande au client de rafraîchir sa carte.';
  if (/non autoris/i.test(m) || /introuvable/i.test(m) || /invalide/i.test(m)) return m; // déjà en français (fonctions SQL)
  // Message d'une fonction SQL en français (raise exception '…') : on le garde s'il est lisible.
  if (m && /^[A-ZÀ-Ý]/.test(m) && !/[a-z]+_[a-z]+/.test(m) && m.length < 120) return m;
  return defaut;
}
