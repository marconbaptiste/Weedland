import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { formatEuros, formatDateFr } from '../lib/format';

// Module — Historique personnel de l'employé (ses clôtures + CA calculé).
export default function Historique() {
  const { utilisateur } = useAuth();
  const [lignes, setLignes] = useState([]);

  useEffect(() => {
    supabase
      .from('v_ca_jour')
      .select('caisse_id, date, ventes_directes, ca_jour, encaissements, ecart')
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
              <th className="droite">Ventes directes</th>
              <th className="droite">CA</th>
              <th className="droite">Encaissements</th>
              <th className="droite">Écart</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.caisse_id}>
                <td>{formatDateFr(l.date)}</td>
                <td className="droite">{formatEuros(l.ventes_directes)}</td>
                <td className="droite">{formatEuros(l.ca_jour)}</td>
                <td className="droite">{formatEuros(l.encaissements)}</td>
                <td className={`droite ${Number(l.ecart) === 0 ? 'solde-ok' : 'dette'}`}>
                  {formatEuros(l.ecart)}
                </td>
              </tr>
            ))}
            {lignes.length === 0 && (
              <tr>
                <td colSpan={5} className="vide">
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
