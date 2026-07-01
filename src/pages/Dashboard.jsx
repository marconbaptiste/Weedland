import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { formatEuros, formatNombre, formatDateFr } from '../lib/format';
import { aujourdhuiISO, intervallePeriode, decalerReference } from '../lib/dates';
import { somme } from '../lib/comptabilite';
import { telechargerCSV, telechargerPDF } from '../lib/export';

// Module 4 — Dashboard employeur (réservé admin). Vue consolidée jour/semaine/mois.
export default function Dashboard() {
  const [periode, setPeriode] = useState('jour');
  const [reference, setReference] = useState(aujourdhuiISO());
  const [perso, setPerso] = useState(() => {
    const [d, f] = intervallePeriode('mois');
    return { debut: d, fin: f };
  });
  const [employeFiltre, setEmployeFiltre] = useState('');
  const [employes, setEmployes] = useState([]);
  const [caRows, setCaRows] = useState([]);
  const [chromesAll, setChromesAll] = useState([]); // tous les chromes de la période
  const [intRows, setIntRows] = useState([]);
  const [totalPaiements, setTotalPaiements] = useState(0);
  const [erreur, setErreur] = useState('');

  const [debut, fin] =
    periode === 'perso' ? [perso.debut, perso.fin] : intervallePeriode(periode, reference);

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

    // Tous les chromes de la période (y compris ceux saisis un jour sans
    // clôture : montants dus oubliés). Ils ajustent le CA.
    let qc = supabase.from('chromes').select('date, employe_id, type, montant').gte('date', debut).lte('date', fin);
    if (employeFiltre) qc = qc.eq('employe_id', employeFiltre);
    const { data: chr } = await qc;
    setChromesAll(chr ?? []);

    // Intéressement + heures par employé (propriétaires + co-participants).
    let qi = supabase
      .from('v_interessement_employe')
      .select('caisse_id, employe_id, date, est_proprietaire, heures_travaillees, pourcentage_interessement, ca_jour, encaissements, interessement')
      .gte('date', debut)
      .lte('date', fin)
      .order('date', { ascending: false });
    if (employeFiltre) qi = qi.eq('employe_id', employeFiltre);
    const { data: ir, error: errInt } = await qi;
    if (errInt) setErreur((e) => `${e ? e + ' · ' : ''}v_interessement_employe : ${errInt.message}`);
    setIntRows(ir ?? []);
  }, [debut, fin, employeFiltre]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Chromes agrégés par (employé|date) — sert au total ET à repérer les jours
  // de chromes sans clôture (montants dus oubliés).
  const chromeParCle = new Map();
  chromesAll.forEach((c) => {
    const cle = `${c.employe_id}|${c.date}`;
    const v = chromeParCle.get(cle) ?? { avances: 0, remboursements: 0 };
    if (c.type === 'avance') v.avances = somme([v.avances, c.montant]);
    else v.remboursements = somme([v.remboursements, c.montant]);
    chromeParCle.set(cle, v);
  });

  const totaux = {
    encaissements: somme(caRows.map((r) => r.encaissements)),
    avances: somme(chromesAll.filter((c) => c.type === 'avance').map((c) => c.montant)),
    remboursements: somme(chromesAll.filter((c) => c.type === 'remboursement').map((c) => c.montant)),
    // Intéressement et heures incluent les journées partagées (co-participants).
    interessement: somme(intRows.map((r) => r.interessement)),
    heures: somme(intRows.map((r) => r.heures_travaillees)),
  };
  // CA = encaissements + avances − remboursements (chromes hors clôture inclus).
  totaux.ca = somme([totaux.encaissements, totaux.avances, -totaux.remboursements]);
  const nomEmploye = (id) => employes.find((e) => e.id === id)?.nom ?? '—';

  // Détail par personne présente : propriétaire de clôture + co-participants
  // (journée partagée). Le CA/encaissements/avances ne concernent que le
  // propriétaire (le CA n'est compté qu'une fois) ; le co-participant n'a que
  // ses heures et sa part d'intéressement.
  const apportCaisse = new Map(caRows.map((r) => [r.caisse_id, r]));
  const lignesCloture = intRows.map((r) => {
    const ca = apportCaisse.get(r.caisse_id);
    return {
      cle: `${r.caisse_id}:${r.employe_id}`,
      date: r.date,
      employe_id: r.employe_id,
      est_proprietaire: r.est_proprietaire,
      ca_jour: r.ca_jour,
      encaissements: r.encaissements,
      cb: r.est_proprietaire ? ca?.cb ?? 0 : null,
      especes: r.est_proprietaire ? ca?.especes ?? 0 : null,
      avances: r.est_proprietaire ? ca?.avances ?? 0 : null,
      remboursements: r.est_proprietaire ? ca?.remboursements ?? 0 : null,
      heures: r.heures_travaillees,
      pourcentage: r.pourcentage_interessement,
      interessement: r.interessement,
    };
  });
  // Jours de chromes SANS clôture → lignes « hors clôture » (CA = avances − remb.).
  const closureCles = new Set(caRows.map((r) => `${r.employe_id}|${r.date}`));
  const lignesOrphelines = [...chromeParCle.entries()]
    .filter(([cle]) => !closureCles.has(cle))
    .map(([cle, v]) => {
      const [employe_id, date] = cle.split('|');
      return {
        cle: `orphan:${cle}`,
        date,
        employe_id,
        est_proprietaire: true,
        orphelin: true,
        ca_jour: somme([v.avances, -v.remboursements]),
        encaissements: null,
        avances: v.avances,
        remboursements: v.remboursements,
        heures: 0,
        pourcentage: 0,
        interessement: 0,
      };
    });
  const lignesDetail = [...lignesCloture, ...lignesOrphelines].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.est_proprietaire ? 1 : 0) - (a.est_proprietaire ? 1 : 0);
  });
  const nomLigne = (r) =>
    nomEmploye(r.employe_id) + (r.orphelin ? ' (hors clôture)' : r.est_proprietaire ? '' : ' (partagé)');

  function exporter() {
    const entetes = [
      'Date', 'Employé', 'Avances', 'Remboursements',
      'CA', 'CB', 'Espèces', 'Encaissements', 'Heures', '% intéress.', 'Intéressement',
    ];
    const lignes = lignesDetail.map((r) => [
      r.date, nomLigne(r), r.avances ?? '', r.remboursements ?? '',
      r.ca_jour ?? '', r.cb ?? '', r.especes ?? '', r.encaissements ?? '',
      r.heures, r.pourcentage, r.interessement,
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
      'Heures', '%', 'Intéress.',
    ];
    const tiret = (v) => (v != null ? formatEuros(v) : '—');
    const lignes = lignesDetail.map((r) => [
      formatDateFr(r.date), nomLigne(r), tiret(r.ca_jour),
      tiret(r.encaissements), tiret(r.avances), tiret(r.remboursements),
      formatNombre(r.heures),
      `${r.pourcentage} %`, formatEuros(r.interessement),
    ]);
    telechargerPDF(`recap-${debut}_${fin}.pdf`, {
      titre: 'Kanabiz — Récapitulatif',
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
          {[
            ['jour', 'Jour'],
            ['semaine', 'Semaine'],
            ['mois', 'Mois'],
            ['annee', 'Année'],
            ['perso', 'Sur-mesure'],
          ].map(([p, libelle]) => (
            <button key={p} className={periode === p ? 'actif' : ''} onClick={() => setPeriode(p)}>
              {libelle}
            </button>
          ))}
        </div>
        {periode === 'perso' ? (
          <div className="form-inline">
            <label className="field">
              <span>Du</span>
              <input type="date" value={perso.debut} onChange={(e) => setPerso((p) => ({ ...p, debut: e.target.value }))} />
            </label>
            <label className="field">
              <span>Au</span>
              <input type="date" value={perso.fin} onChange={(e) => setPerso((p) => ({ ...p, fin: e.target.value }))} />
            </label>
          </div>
        ) : (
          <label className="field">
            <span>{periode === 'jour' ? 'Jour' : periode === 'semaine' ? 'Semaine du' : periode === 'annee' ? 'Année' : 'Mois'}</span>
            <div className="nav-periode">
              <button
                type="button"
                className="btn btn-discret"
                onClick={() => setReference((r) => decalerReference(periode, r, -1))}
                aria-label="Période précédente"
              >
                ‹
              </button>
              <input type="date" value={reference} onChange={(e) => setReference(e.target.value)} />
              <button
                type="button"
                className="btn btn-discret"
                onClick={() => setReference((r) => decalerReference(periode, r, 1))}
                aria-label="Période suivante"
              >
                ›
              </button>
            </div>
          </label>
        )}
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
              <th className="droite">Heures</th>
              <th className="droite">Intéress.</th>
            </tr>
          </thead>
          <tbody>
            {lignesDetail.map((r) => (
              <tr key={r.cle}>
                <td>{formatDateFr(r.date)}</td>
                <td>{nomLigne(r)}</td>
                <td className="droite">{r.ca_jour != null ? formatEuros(r.ca_jour) : '—'}</td>
                <td className="droite">{r.encaissements != null ? formatEuros(r.encaissements) : '—'}</td>
                <td className="droite">{r.avances != null ? formatEuros(r.avances) : '—'}</td>
                <td className="droite">{r.remboursements != null ? formatEuros(r.remboursements) : '—'}</td>
                <td className="droite">{formatNombre(r.heures)}</td>
                <td className="droite">{formatEuros(r.interessement)}</td>
              </tr>
            ))}
            {lignesDetail.length === 0 && (
              <tr>
                <td colSpan={8} className="vide">
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
