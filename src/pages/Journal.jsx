import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatEuros } from '../lib/format';

// Journal principal (admin) — flux d'activité du magasin, le plus simplifié
// possible : tout ce que fait l'équipe au comptoir (clôtures de caisse +
// chromes). Reconstruit à partir des created_at / employe_id déjà horodatés
// (pas de table de logs redondante). Colonnes : nom · date · heure · mouvement.
// Les noms d'employés sont résolus via une table de correspondance séparée
// (pas d'embed PostgREST sur `users` : caisse_jour a plusieurs relations vers
// users, ce qui rendait l'embed ambigu et vidait la requête).
function heure(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Date compacte jj/mm/aa pour tenir dans la largeur de l'écran mobile.
function dateCourte(iso) {
  const [a, m, j] = (iso ?? '').split('-');
  return a ? `${j}/${m}/${a.slice(2)}` : '';
}

export default function Journal() {
  const [evenements, setEvenements] = useState([]);

  useEffect(() => {
    (async () => {
      const [caisse, chromes, users] = await Promise.all([
        supabase
          .from('caisse_jour')
          .select('id, date, created_at, ventes_directes, employe_id')
          .order('date', { ascending: false })
          .limit(200),
        supabase
          .from('chromes')
          .select('id, date, created_at, type, montant, employe_id, clients(surnom)')
          .order('date', { ascending: false })
          .limit(200),
        supabase.from('users').select('id, nom'),
      ]);

      const noms = Object.fromEntries((users.data ?? []).map((u) => [u.id, u.nom]));

      const items = [
        ...(caisse.data ?? []).map((c) => ({
          cle: `caisse-${c.id}`,
          date: c.date,
          created_at: c.created_at,
          nom: noms[c.employe_id] ?? '—',
          type: 'cloture',
          montant: c.ventes_directes,
          apropos: 'Clôture caisse',
        })),
        ...(chromes.data ?? []).map((c) => ({
          cle: `chrome-${c.id}`,
          date: c.date,
          created_at: c.created_at,
          nom: noms[c.employe_id] ?? '—',
          type: c.type, // 'avance' | 'remboursement'
          montant: c.montant,
          apropos: c.clients?.surnom ?? 'client',
        })),
      ]
        // Tri par jour d'activité (date métier) puis par heure de saisie : ainsi
        // la clôture d'un jour reste côte à côte avec les chromes du même jour,
        // même si elle a été enregistrée/importée à un autre moment.
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : new Date(b.created_at) - new Date(a.created_at)));

      setEvenements(items.slice(0, 250));
    })();
  }, []);

  // Montant signé + couleur, cohérent avec le reste de l'app (Profil) :
  // avance = + rouge (la dette du client augmente), remboursement = − vert
  // (la dette diminue). Clôture de caisse = encaissement, + vert.
  function montantSigne(e) {
    if (e.type === 'avance') return { classe: 'dette', texte: `+ ${formatEuros(e.montant)}` };
    if (e.type === 'remboursement') return { classe: 'solde-ok', texte: `− ${formatEuros(e.montant)}` };
    return { classe: 'solde-ok', texte: `+ ${formatEuros(e.montant)}` }; // clôture (encaissement)
  }

  return (
    <div className="page">
      <h1>Journal</h1>
      <p className="periode-info">Activité récente du comptoir : clôtures de caisse et chromes.</p>
      <div className="card">
        <table className="tableau journal-tableau">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Date</th>
              <th>Heure</th>
              <th>Mouvement</th>
            </tr>
          </thead>
          <tbody>
            {evenements.map((e) => {
              const m = montantSigne(e);
              return (
                <tr key={e.cle}>
                  <td>{e.nom}</td>
                  <td>{dateCourte(e.date)}</td>
                  <td>{heure(e.created_at)}</td>
                  <td>
                    <strong className={m.classe}>{m.texte}</strong>
                    <span className="journal-apropos"> · {e.apropos}</span>
                  </td>
                </tr>
              );
            })}
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
