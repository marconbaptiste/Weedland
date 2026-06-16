import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { formatEuros, formatNombre, formatDateFr } from '../lib/format';

// Module — Historique personnel de l'employé : ses clôtures + ses journées
// partagées (co-participation), avec l'intéressement de chacune.
export default function Historique() {
  const { utilisateur } = useAuth();
  const [lignes, setLignes] = useState([]);

  useEffect(() => {
    supabase
      .from('v_interessement_employe')
      .select('caisse_id, date, est_proprietaire, ca_jour, encaissements, ecart, heures_travaillees, interessement')
      .eq('employe_id', utilisateur.id)
      .order('date', { ascending: false })
      .then(({ data }) => setLignes(data ?? []));
  }, [utilisateur.id]);

  return (
    <div className="page">
      <h1>Mon historique</h1>
      <div className="card">
        <table className="tableau">
          <thead>
            <tr>
              <th>Date</th>
              <th className="droite">CA</th>
              <th className="droite">Encaissements</th>
              <th className="droite">Écart</th>
              <th className="droite">Heures</th>
              <th className="droite">Intéress.</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.caisse_id}>
                <td>
                  {formatDateFr(l.date)}
                  {!l.est_proprietaire && <span className="badge badge-solde tag-partage">partagée</span>}
                </td>
                <td className="droite">{l.est_proprietaire ? formatEuros(l.ca_jour) : '—'}</td>
                <td className="droite">{l.est_proprietaire ? formatEuros(l.encaissements) : '—'}</td>
                <td className={`droite ${l.est_proprietaire && Number(l.ecart) !== 0 ? 'dette' : 'solde-ok'}`}>
                  {l.est_proprietaire ? formatEuros(l.ecart) : '—'}
                </td>
                <td className="droite">{formatNombre(l.heures_travaillees)}</td>
                <td className="droite">{formatEuros(l.interessement)}</td>
              </tr>
            ))}
            {lignes.length === 0 && (
              <tr>
                <td colSpan={6} className="vide">
                  Aucune clôture enregistrée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
