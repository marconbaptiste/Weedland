import { supabase } from './supabase';

// Journalise un mouvement de stock dans le registre INVIOLABLE `stock_mouvements`.
// Le journal est append-only (RLS : ni UPDATE ni DELETE) ; l'auteur est forcé
// côté serveur (trigger). Une erreur de journalisation ne doit jamais bloquer
// le mouvement réel du stock : on avale l'erreur (au pire on perd une trace,
// jamais une opération). Le `magasin_id`/`employe_id` sont remplis en base.
//
// motif : 'entree' | 'sortie' | 'creation' | 'correction' | 'import' | 'suppression'
export async function journaliserMouvement({ stock_id = null, produit, delta, quantite_apres = null, motif = 'mouvement' }) {
  if (!produit || !Number.isFinite(delta) || delta === 0) return;
  try {
    await supabase.from('stock_mouvements').insert({
      stock_id,
      produit,
      delta,
      quantite_apres,
      motif,
    });
  } catch {
    /* trace best-effort : ne jamais faire échouer l'opération de stock */
  }
}
