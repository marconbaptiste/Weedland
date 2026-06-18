import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { formatEuros, formatNombre, formatDateFr } from '../lib/format';
import { premierDuMois, intervallePeriode } from '../lib/dates';

// Module Historique.
// - Admin : historique GÉNÉRAL (toutes les clôtures, tous les employés) en
//   fiches lisibles, avec le détail des chromes par client.
// - Employé : son propre historique (clôtures + journées partagées).
export default function Historique() {
  const { utilisateur, estAdmin } = useAuth();

  // ---------- Vue employé (personnelle) ----------
  const [perso, setPerso] = useState([]);
  useEffect(() => {
    if (estAdmin) return;
    supabase
      .from('v_interessement_employe')
      .select('caisse_id, date, est_proprietaire, ca_jour, encaissements, ecart, heures_travaillees, interessement')
      .eq('employe_id', utilisateur.id)
      .order('date', { ascending: false })
      .then(({ data }) => setPerso(data ?? []));
  }, [estAdmin, utilisateur.id]);

  // ---------- Vue admin (générale) ----------
  const [mois, setMois] = useState(premierDuMois());
  const [closures, setClosures] = useState([]);
  const [noms, setNoms] = useState({});
  const [chromes, setChromes] = useState({}); // clé `employe|date` -> {avances, remboursements}

  const chargerAdmin = useCallback(async () => {
    const [debut, fin] = intervallePeriode('mois', mois);
    const [cl, emps, chr] = await Promise.all([
      supabase
        .from('v_ca_jour')
        .select('caisse_id, date, employe_id, ventes_directes, cb, especes, fond_caisse, avances, remboursements, ca_jour, encaissements, ecart')
        .gte('date', debut)
        .lte('date', fin)
        .order('date', { ascending: false }),
      supabase.from('users').select('id, nom'),
      supabase
        .from('chromes')
        .select('date, employe_id, type, montant, clients(surnom)')
        .gte('date', debut)
        .lte('date', fin),
    ]);
    setClosures(cl.data ?? []);
    setNoms(Object.fromEntries((emps.data ?? []).map((e) => [e.id, e.nom])));
    const map = {};
    (chr.data ?? []).forEach((c) => {
      const k = `${c.employe_id}|${c.date}`;
      if (!map[k]) map[k] = { avances: [], remboursements: [] };
      const cible = c.type === 'avance' ? map[k].avances : map[k].remboursements;
      cible.push({ surnom: c.clients?.surnom ?? 'client', montant: c.montant });
    });
    setChromes(map);
  }, [mois]);

  useEffect(() => {
    if (estAdmin) chargerAdmin();
  }, [estAdmin, chargerAdmin]);

  if (!estAdmin) {
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
              {perso.map((l) => (
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
              {perso.length === 0 && (
                <tr><td colSpan={6} className="vide">Aucune clôture enregistrée.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // --- Admin : fiches par clôture ---
  return (
    <div className="page">
      <h1>Historique général</h1>

      <div className="card filtres">
        <label className="field">
          <span>Mois</span>
          <input type="month" value={mois.slice(0, 7)} onChange={(e) => setMois(`${e.target.value}-01`)} />
        </label>
        <p className="periode-info">{closures.length} clôture(s)</p>
      </div>

      {closures.map((c) => {
        const det = chromes[`${c.employe_id}|${c.date}`] || { avances: [], remboursements: [] };
        return (
          <div key={c.caisse_id} className="card histo">
            <div className="histo-tete">
              <strong>{noms[c.employe_id] ?? '—'}</strong>
              <span className="histo-date">{formatDateFr(c.date)}</span>
            </div>
            <div className="histo-grille">
              <span>CA</span><strong>{formatEuros(c.ca_jour)}</strong>
              <span>CB</span><span>{formatEuros(c.cb)}</span>
              <span>Espèces (Moro)</span><span>{formatEuros(c.especes)}</span>
              <span>Fond de caisse</span><span>{formatEuros(c.fond_caisse)}</span>
            </div>

            {det.avances.length > 0 && (
              <div className="histo-bloc">
                <span className="histo-titre">Chromes — avances</span>
                {det.avances.map((a, i) => (
                  <div key={i} className="histo-chrome">
                    <span>{a.surnom}</span>
                    <span className="dette">+ {formatEuros(a.montant)}</span>
                  </div>
                ))}
              </div>
            )}

            {det.remboursements.length > 0 && (
              <div className="histo-bloc">
                <span className="histo-titre">Chromes — remboursements</span>
                {det.remboursements.map((r, i) => (
                  <div key={i} className="histo-chrome">
                    <span>{r.surnom}</span>
                    <span className="solde-ok">− {formatEuros(r.montant)}</span>
                  </div>
                ))}
              </div>
            )}

            {Number(c.ecart) !== 0 && (
              <div className="voyant voyant-rouge">Écart de caisse : {formatEuros(c.ecart)}</div>
            )}
          </div>
        );
      })}

      {closures.length === 0 && <p className="vide">Aucune clôture ce mois-ci.</p>}
    </div>
  );
}
