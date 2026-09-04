import { supabase } from './supabase';

// Exporte TOUTES les données du magasin de l'utilisateur (RLS = son magasin)
// dans un fichier JSON téléchargeable (portabilité / réversibilité — RGPD et
// CGV art. 8). Disponible même si l'accès est bloqué (l'export reste un droit
// de l'admin sur ses propres données). Les justificatifs (photos) sont listés
// par chemin ; ils se téléchargent depuis la page Comptabilité.
const TABLES = [
  'magasins',
  'users',
  'clients',
  'caisse_jour',
  'caisse_partage',
  'chromes',
  'chrome_evenements',
  'promos',
  'promotions',
  'commandes',
  'fidelite_evenements',
  'stocks',
  'stock_mouvements',
  'liste_courses',
  'charges',
  'fournisseurs',
  'paiements_employes',
  'fiches_paie',
  'plannings',
  'parametres',
  'messages',
];

export async function exporterMagasin() {
  const data = { exporte_le: new Date().toISOString(), tables: {}, erreurs: [] };
  for (const t of TABLES) {
    const { data: rows, error } = await supabase.from(t).select('*');
    if (error) {
      // Table absente de cette installation ou non lisible : on le note dans
      // le fichier au lieu de produire silencieusement une table vide.
      data.erreurs.push({ table: t, erreur: error.message });
      continue;
    }
    data.tables[t] = rows ?? [];
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `donnees-magasin-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return data.erreurs;
}
