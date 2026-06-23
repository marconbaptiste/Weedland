import { supabase } from './supabase';

// Exporte toutes les données du magasin de l'utilisateur (RLS = son magasin)
// dans un fichier JSON téléchargeable. Disponible même si l'accès est bloqué
// (l'export reste un droit de l'admin sur ses propres données — RGPD).
const TABLES = [
  'clients',
  'caisse_jour',
  'chromes',
  'promos',
  'stocks',
  'charges',
  'fournisseurs',
  'paiements_employes',
];

export async function exporterMagasin() {
  const data = {};
  for (const t of TABLES) {
    const { data: rows } = await supabase.from(t).select('*');
    data[t] = rows ?? [];
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `donnees-magasin-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
