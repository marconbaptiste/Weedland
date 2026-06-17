import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { formatEuros, formatNombre, formatDateFr } from '../lib/format';
import { aujourdhuiISO, intervallePeriode } from '../lib/dates';
import { somme } from '../lib/comptabilite';
import { telechargerCSV, telechargerPDF } from '../lib/export';

// Module 4 — Dashboard employeur (réservé admin). Vue consolidée jour/semaine/mois.
export default function Dashboard() {
  const [periode, setPeriode] = useState('jour');
  const [reference, setReference] = useState(aujourdhuiISO());
  const [employeFiltre, setEmployeFiltre] = useState('');
  const [employes, setEmployes] = useState([]);
  const [caRows, setCaRows] = useState([]);
  const [intRows, setIntRows] = useState([]);
  const [totalPaiements, setTotalPaiements] = useState(0);
  const [erreur, setErreur] = useState('');

  const [debut, fin] = intervallePeriode(periode, reference);

  useEffect(() => {
    supabase
      .from('users')
      .select('id, nom')
      .order('nom')
      .then(({ data }) => setEmployes(data ?? []));
  }, []);

  const charger = useCallback(async () => {
    setErreur('');
    let q = supabase
      .from('v_ca_jour')
      .select('caisse_id, date, employe_id, ventes_directes, cb, especes, avances, remboursements, ca_jour, encaissements, ecart, heures_travaillees, pourcentage_interessement, interessement')
      .gte('date', debut)
      .lte('date', fin)
      .order('date', { ascending: false });
    if (employeFiltre) q = q.eq('employe_id', employeFiltre);
    const { data: ca, error: errCa } = await q;
    if (errCa) setErreur(`v_ca_jour : ${errCa.message}`);
    setCaRows(ca ?? []);

    let qp = supabase
      .from('paiements_employes')
      .select('montant, employe_id')
      .gte('date', debut)
      .lte('date', fin);
    if (employeFiltre) qp = qp.eq('employe_id', employeFiltre);
    const { data: pay } = await qp;
    setTotalPaiements(somme((pay ?? []).map((p) => p.montant)));

    // Intéressement + heures par employé (propriétaires + co-participants).
    let qi = supabase
      .from('v_interessement_employe')
      .select('employe_id, interessement, heures_travaillees')
      .gte('date', debut)
      .lte('date', fin);
    if (employeFiltre) qi = qi.eq('employe_id', employeFiltre);
    const { data: ir, error: errInt } = await qi;
    if (errInt) setErreur((e) => `${e ? e + ' · ' : ''}v_interessement_employe : ${errInt.message}`);
    setIntRows(ir ?? []);
  }, [debut, fin, employeFiltre]);

  useEffect(() => {
    charger();
  }, [charger]);

  const totaux = {
    ca: somme(caRows.map((r) => r.ca_jour)),
    encaissements: somme(caRows.map((r) => r.encaissements)),
    avances: somme(caRows.map((r) => r.avances)),
    remboursements: somme(caRows.map((r) => r.remboursements)),
    // Intéressement et heures incluent les journées partagées (co-participants).
    interessement: somme(intRows.map((r) => r.interessement)),
    heures: somme(intRows.map((r) => r.heures_travaillees)),
  };
  const nomEmploye = (id) => employes.find((e) => e.id === id)?.nom ?? '—';

  function exporter() {
    const entetes = [
      'Date', 'Employé', 'Ventes directes', 'Avances', 'Remboursements',
      'CA', 'CB', 'Espèces', 'Encaissements', 'Écart', 'Heures', '% intéress.', 'Intéressement',
    ];
    const lignes = caRows.map((r) => [
      r.date, nomEmploye(r.employe_id), r.ventes_directes, r.avances,
      r.remboursements, r.ca_jour, r.cb, r.especes, r.encaissements, r.ecart,
      r.heures_travaillees, r.pourcentage_interessement, r.interessement,
    ]);
    telechargerCSV(`recap-${debut}_${fin}.csv`, entetes, lignes);
  }

  function exporterPDF() {
    const sousTitre =
      `Période : ${formatDateFr(debut)} → ${formatDateFr(fin)} · ` +
      (employeFiltre ? nomEmploye(employeFiltre) : 'Tous les employés');
    const resume = [
      ['CA', formatEuros(totaux.ca)],
      ['Encaissements', formatEuros(totaux.encaissements)],
      ['Avances', formatEuros(totaux.avances)],
      ['Remboursements', formatEuros(totaux.remboursements)],
      ['Intéressement', formatEuros(totaux.interessement)],
      ['Heures travaillées', `${formatNombre(totaux.heures)} h`],
      ['Paiements employés', formatEuros(totalPaiements)],
    ];
    const entetes = [
      'Date', 'Employé', 'CA', 'Encaiss.', 'Avances', 'Rembours.',
      'Écart', 'Heures', '%', 'Intéress.',
    ];
    const lignes = caRows.map((r) => [
      formatDateFr(r.date), nomEmploye(r.employe_id), formatEuros(r.ca_jour),
      formatEuros(r.encaissements), formatEuros(r.avances), formatEuros(r.remboursements),
      formatEuros(r.ecart), formatNombre(r.heures_travaillees),
      `${r.pourcentage_interessement} %`, formatEuros(r.interessement),
    ]);
    telechargerPDF(`recap-${debut}_${fin}.pdf`, {
      titre: 'Weedland — Récapitulatif',
      sousTitre,
      resume,
      entetes,
      lignes,
    });
  }

  return (
    <div className="page">
      <h1>Dashboard</h1>

      {erreur && <div className="voyant voyant-rouge">Erreur de lecture — {erreur}</div>}

      <div className="card filtres">
        <div className="bascule">
          {['jour', 'semaine', 'mois'].map((p) => (
            <button key={p} className={periode === p ? 'actif' : ''} onClick={() => setPeriode(p)}>
              {p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Date de référence</span>
          <input type="date" value={reference} onChange={(e) => setReference(e.target.value)} />
        </label>
        <label className="field">
          <span>Employé</span>
          <select value={employeFiltre} onChange={(e) => setEmployeFiltre(e.target.value)}>
            <option value="">Tous</option>
            {employes.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.nom}
              </option>
            ))}
          </select>
        </label>
        <div className="form-inline">
          <button className="btn" onClick={exporter}>
            Export CSV / Excel
          </button>
          <button className="btn" onClick={exporterPDF}>
            Export PDF
          </button>
        </div>
        <p className="periode-info">
          Période : {formatDateFr(debut)} → {formatDateFr(fin)}
        </p>
      </div>

      <div className="cartes-kpi">
        <div className="kpi">
          <span className="kpi-label">CA</span>
          <span className="kpi-valeur">{formatEuros(totaux.ca)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Encaissements</span>
          <span className="kpi-valeur">{formatEuros(totaux.encaissements)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Avances</span>
          <span className="kpi-valeur">{formatEuros(totaux.avances)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Remboursements</span>
          <span className="kpi-valeur">{formatEuros(totaux.remboursements)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Intéressement</span>
          <span className="kpi-valeur">{formatEuros(totaux.interessement)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Heures</span>
          <span className="kpi-valeur">{formatNombre(totaux.heures)} h</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Paiements employés</span>
          <span className="kpi-valeur">{formatEuros(totalPaiements)}</span>
        </div>
      </div>

      <div className="card">
        <h2>Détail par clôture</h2>
        <table className="tableau">
          <thead>
            <tr>
              <th>Date</th>
              <th>Employé</th>
              <th className="droite">CA</th>
              <th className="droite">Encaissements</th>
              <th className="droite">Avances</th>
              <th className="droite">Rembours.</th>
              <th className="droite">Écart</th>
              <th className="droite">Heures</th>
              <th className="droite">Intéress.</th>
            </tr>
          </thead>
          <tbody>
            {caRows.map((r) => (
              <tr key={r.caisse_id}>
                <td>{formatDateFr(r.date)}</td>
                <td>{nomEmploye(r.employe_id)}</td>
                <td className="droite">{formatEuros(r.ca_jour)}</td>
                <td className="droite">{formatEuros(r.encaissements)}</td>
                <td className="droite">{formatEuros(r.avances)}</td>
                <td className="droite">{formatEuros(r.remboursements)}</td>
                <td className={`droite ${Number(r.ecart) === 0 ? 'solde-ok' : 'dette'}`}>
                  {formatEuros(r.ecart)}
                </td>
                <td className="droite">{formatNombre(r.heures_travaillees)}</td>
                <td className="droite">{formatEuros(r.interessement)}</td>
              </tr>
            ))}
            {caRows.length === 0 && (
              <tr>
                <td colSpan={9} className="vide">
                  Aucune donnée sur la période.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
