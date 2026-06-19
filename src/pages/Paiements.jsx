import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
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
  // Édition en ligne d'un paiement existant (admin).
  const [edition, setEdition] = useState(null); // id en cours d'édition
  const [editForm, setEditForm] = useState({ employe_id: '', montant: '', motif: '', date: '' });
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

  function commencerEdition(p) {
    setEdition(p.id);
    setEditForm({
      employe_id: p.employe_id,
      montant: String(p.montant),
      motif: p.motif ?? '',
      date: p.date,
    });
  }

  async function enregistrerEdition(id) {
    const valeur = parseMontant(editForm.montant);
    if (!editForm.employe_id || valeur <= 0) return;
    const { error } = await supabase
      .from('paiements_employes')
      .update({
        employe_id: editForm.employe_id,
        montant: valeur,
        motif: editForm.motif || null,
        date: editForm.date,
      })
      .eq('id', id);
    if (!error) {
      setEdition(null);
      charger();
    }
  }

  async function supprimer(id) {
    if (!window.confirm('Supprimer ce paiement ? Cette action est irréversible.')) return;
    const { error } = await supabase.from('paiements_employes').delete().eq('id', id);
    if (!error) charger();
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

      <Link to="/fiches-paie" className="btn">
        🧾 Éditer une fiche de paie
      </Link>

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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {paiements.map((p) =>
              edition === p.id ? (
                <tr key={p.id}>
                  <td>
                    <input
                      type="date"
                      value={editForm.date}
                      onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                    />
                  </td>
                  <td>
                    <select
                      value={editForm.employe_id}
                      onChange={(e) => setEditForm((f) => ({ ...f, employe_id: e.target.value }))}
                    >
                      {employes.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.nom}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="champ-nom"
                      value={editForm.motif}
                      onChange={(e) => setEditForm((f) => ({ ...f, motif: e.target.value }))}
                    />
                  </td>
                  <td className="droite">
                    <input
                      className="champ-pourcentage"
                      type="text"
                      inputMode="decimal"
                      value={editForm.montant}
                      onChange={(e) => setEditForm((f) => ({ ...f, montant: e.target.value }))}
                    />
                  </td>
                  <td className="actions-cellule">
                    <button type="button" className="btn btn-discret" onClick={() => enregistrerEdition(p.id)}>
                      Enregistrer
                    </button>
                    <button type="button" className="btn btn-discret" onClick={() => setEdition(null)}>
                      Annuler
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={p.id}>
                  <td>{formatDateFr(p.date)}</td>
                  <td>{p.users?.nom ?? '—'}</td>
                  <td>{p.motif ?? '—'}</td>
                  <td className="droite">{formatEuros(p.montant)}</td>
                  <td className="actions-cellule">
                    <button type="button" className="btn btn-discret" onClick={() => commencerEdition(p)}>
                      Modifier
                    </button>
                    <button type="button" className="btn btn-discret" onClick={() => supprimer(p.id)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ),
            )}
            {paiements.length === 0 && (
              <tr>
                <td colSpan={5} className="vide">
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
