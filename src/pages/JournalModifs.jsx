import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatEuros, formatDateFr } from '../lib/format';

// Journal (admin) — audit des modifications de chromes du magasin.
// Alimenté par la table inviolable `chrome_evenements` (trigger append-only) :
// chaque création / modification / suppression d'un chrome y est tracée avec son
// auteur réel. Vue simplifiée : nom · date · heure · client · mouvement.
// Le client (bénéficiaire de l'avance / du remboursement) est résolu via une
// lecture séparée de `clients` (pas de FK sur chrome_evenements.client_id, donc
// pas d'embed PostgREST ; la RLS de `clients` reste cloisonnée au magasin).
const LIB_ACTION = { creation: 'Créé', modification: 'Modifié', suppression: 'Supprimé' };

function heure(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// « Mouvement » lisible : action + sens + montant (ex. « Créé · avance +20 € »),
// suivi du jour du chrome s'il diffère du jour de la saisie (correction a posteriori).
function mouvement(e) {
  const signe = e.type === 'avance' ? '+' : e.type === 'remboursement' ? '−' : '';
  const montant = e.montant != null ? `${signe} ${formatEuros(e.montant)}` : '';
  const sens = e.type ? ` · ${e.type}` : '';
  const jour = e.date_chrome && e.date_chrome !== (e.created_at ?? '').slice(0, 10) ? ` (pour le ${formatDateFr(e.date_chrome)})` : '';
  return `${LIB_ACTION[e.action] ?? e.action}${sens} ${montant}${jour}`.trim();
}

export default function JournalModifs() {
  const [evenements, setEvenements] = useState([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('chrome_evenements')
        .select('id, action, type, montant, date_chrome, client_id, created_at, auteur:employe_id(nom)')
        .order('created_at', { ascending: false })
        .limit(200);
      const evts = data ?? [];
      const ids = [...new Set(evts.map((e) => e.client_id).filter(Boolean))];
      const { data: clients } = ids.length
        ? await supabase.from('clients').select('id, surnom').in('id', ids)
        : { data: [] };
      const surnoms = Object.fromEntries((clients ?? []).map((c) => [c.id, c.surnom]));
      setEvenements(evts.map((e) => ({ ...e, client: surnoms[e.client_id] ?? 'client supprimé' })));
    })();
  }, []);

  return (
    <div className="page">
      <h1>Journal chromes</h1>
      <p className="periode-info">Modifications des chromes : création, correction, suppression — et pour quel client.</p>
      <div className="card">
        <table className="tableau">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Date</th>
              <th>Heure</th>
              <th>Client</th>
              <th>Mouvement</th>
            </tr>
          </thead>
          <tbody>
            {evenements.map((e) => (
              <tr key={e.id}>
                <td>{e.auteur?.nom ?? '—'}</td>
                <td>{formatDateFr(e.created_at)}</td>
                <td>{heure(e.created_at)}</td>
                <td><strong>{e.client}</strong></td>
                <td className={`action-${e.action}`}>{mouvement(e)}</td>
              </tr>
            ))}
            {evenements.length === 0 && (
              <tr>
                <td colSpan={5} className="vide">Aucune modification enregistrée.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
