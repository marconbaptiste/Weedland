import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatEuros, formatDateFr } from '../lib/format';

// Journal principal (admin) — flux d'activité du magasin, le plus simplifié
// possible : tout ce que fait l'équipe au comptoir (clôtures de caisse +
// chromes). Reconstruit à partir des created_at / employe_id déjà horodatés
// (pas de table de logs redondante). Colonnes : nom · date · heure · mouvement.
function heure(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function Journal() {
  const [evenements, setEvenements] = useState([]);

  useEffect(() => {
    (async () => {
      const [caisse, chromes] = await Promise.all([
        supabase
          .from('caisse_jour')
          .select('id, date, created_at, ventes_directes, users(nom)')
          .order('date', { ascending: false })
          .limit(200),
        supabase
          .from('chromes')
          .select('id, date, created_at, type, montant, users(nom), clients(surnom)')
          .order('date', { ascending: false })
          .limit(200),
      ]);

      const items = [
        ...(caisse.data ?? []).map((c) => ({
          cle: `caisse-${c.id}`,
          date: c.date,
          created_at: c.created_at,
          nom: c.users?.nom ?? '—',
          mouvement: `Clôture caisse · ${formatEuros(c.ventes_directes)}`,
          classe: 'action-creation',
        })),
        ...(chromes.data ?? []).map((c) => ({
          cle: `chrome-${c.id}`,
          date: c.date,
          created_at: c.created_at,
          nom: c.users?.nom ?? '—',
          mouvement:
            (c.type === 'avance' ? 'Avance + ' : 'Remboursement − ') +
            `${formatEuros(c.montant)}` +
            (c.clients?.surnom ? ` · ${c.clients.surnom}` : ''),
          classe: c.type === 'avance' ? 'action-suppression' : 'action-modification',
        })),
      ]
        // Tri par jour d'activité (date métier) puis par heure de saisie : ainsi
        // la clôture d'un jour reste côte à côte avec les chromes du même jour,
        // même si elle a été enregistrée/importée à un autre moment.
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : new Date(b.created_at) - new Date(a.created_at)));

      setEvenements(items.slice(0, 250));
    })();
  }, []);

  return (
    <div className="page">
      <h1>Journal</h1>
      <p className="periode-info">Activité récente du comptoir : clôtures de caisse et chromes.</p>
      <div className="card">
        <table className="tableau">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Date</th>
              <th>Heure</th>
              <th>Mouvement</th>
            </tr>
          </thead>
          <tbody>
            {evenements.map((e) => (
              <tr key={e.cle}>
                <td>{e.nom}</td>
                <td>{formatDateFr(e.date)}</td>
                <td>{heure(e.created_at)}</td>
                <td className={e.classe}>{e.mouvement}</td>
              </tr>
            ))}
            {evenements.length === 0 && (
              <tr>
                <td colSpan={4} className="vide">Aucune activité.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
