import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatEuros, formatDateFr } from '../lib/format';

// Journal (admin) — audit des modifications de chromes du magasin.
// Alimenté par la table inviolable `chrome_evenements` (trigger append-only) :
// chaque création / modification / suppression d'un chrome y est tracée avec son
// auteur réel. Vue simplifiée : nom · date · heure · mouvement.
const LIB_ACTION = { creation: 'Créé', modification: 'Modifié', suppression: 'Supprimé' };

function heure(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// « Mouvement » lisible : action + sens + montant (ex. « Créé · avance +20 € »).
function mouvement(e) {
  const signe = e.type === 'avance' ? '+' : e.type === 'remboursement' ? '−' : '';
  const montant = e.montant != null ? `${signe} ${formatEuros(e.montant)}` : '';
  const sens = e.type ? ` · ${e.type}` : '';
  return `${LIB_ACTION[e.action] ?? e.action}${sens} ${montant}`.trim();
}

export default function JournalModifs() {
  const [evenements, setEvenements] = useState([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('chrome_evenements')
        .select('id, action, type, montant, created_at, auteur:employe_id(nom)')
        .order('created_at', { ascending: false })
        .limit(200);
      setEvenements(data ?? []);
    })();
  }, []);

  return (
    <div className="page">
      <h1>Journal</h1>
      <p className="periode-info">Historique des modifications de chromes (création, correction, suppression).</p>
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
              <tr key={e.id}>
                <td>{e.auteur?.nom ?? '—'}</td>
                <td>{formatDateFr(e.created_at)}</td>
                <td>{heure(e.created_at)}</td>
                <td className={`action-${e.action}`}>{mouvement(e)}</td>
              </tr>
            ))}
            {evenements.length === 0 && (
              <tr>
                <td colSpan={4} className="vide">Aucune modification enregistrée.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
