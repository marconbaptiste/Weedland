import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { parseMontant, formatEuros, formatDateFr } from '../lib/format';
import { aujourdhuiISO, intervallePeriode } from '../lib/dates';
import { somme } from '../lib/comptabilite';
import ChampMontant from '../components/ChampMontant';

// Module 3 — Paiements employés (réservé admin). Total par employé / mois courant.
export default function Paiements() {
  const [employes, setEmployes] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [form, setForm] = useState({
    employe_id: '',
    montant: '',
    motif: '',
    date: aujourdhuiISO(),
  });
  const [debutMois, finMois] = intervallePeriode('mois');

  const charger = useCallback(async () => {
    const [emp, pay] = await Promise.all([
      supabase.from('users').select('id, nom').order('nom'),
      supabase
        .from('paiements_employes')
        .select('id, employe_id, montant, motif, date, users(nom)')
        .gte('date', debutMois)
        .lte('date', finMois)
        .order('date', { ascending: false }),
    ]);
    setEmployes(emp.data ?? []);
    setPaiements(pay.data ?? []);
  }, [debutMois, finMois]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function ajouter(e) {
    e.preventDefault();
    const valeur = parseMontant(form.montant);
    if (!form.employe_id || valeur <= 0) return;
    const { error } = await supabase.from('paiements_employes').insert({
      employe_id: form.employe_id,
      montant: valeur,
      motif: form.motif || null,
      date: form.date,
    });
    if (!error) {
      setForm((f) => ({ ...f, montant: '', motif: '' }));
      charger();
    }
  }

  const totauxParEmploye = employes.map((emp) => ({
    ...emp,
    total: somme(
      paiements.filter((p) => p.employe_id === emp.id).map((p) => p.montant),
    ),
  }));

  return (
    <div className="page">
      <h1>Paiements employés</h1>

      <form className="card" onSubmit={ajouter}>
        <label className="field">
          <span>Employé</span>
          <select
            value={form.employe_id}
            onChange={(e) => setForm((f) => ({ ...f, employe_id: e.target.value }))}
          >
            <option value="">— Choisir —</option>
            {employes.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.nom}
              </option>
            ))}
          </select>
        </label>
        <ChampMontant
          label="Montant"
          valeur={form.montant}
          onChange={(v) => setForm((f) => ({ ...f, montant: v }))}
        />
        <label className="field">
          <span>Motif</span>
          <input
            value={form.motif}
            onChange={(e) => setForm((f) => ({ ...f, motif: e.target.value }))}
          />
        </label>
        <label className="field">
          <span>Date</span>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
        </label>
        <button className="btn btn-primary" type="submit">
          Enregistrer le paiement
        </button>
      </form>

      <div className="card">
        <h2>Totaux du mois</h2>
        <div className="totaux">
          {totauxParEmploye.map((emp) => (
            <div key={emp.id} className="recap-ligne">
              <span>{emp.nom}</span>
              <strong>{formatEuros(emp.total)}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Paiements du mois</h2>
        <table className="tableau">
          <thead>
            <tr>
              <th>Date</th>
              <th>Employé</th>
              <th>Motif</th>
              <th className="droite">Montant</th>
            </tr>
          </thead>
          <tbody>
            {paiements.map((p) => (
              <tr key={p.id}>
                <td>{formatDateFr(p.date)}</td>
                <td>{p.users?.nom ?? '—'}</td>
                <td>{p.motif ?? '—'}</td>
                <td className="droite">{formatEuros(p.montant)}</td>
              </tr>
            ))}
            {paiements.length === 0 && (
              <tr>
                <td colSpan={4} className="vide">
                  Aucun paiement ce mois-ci.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
