import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { aujourdhuiISO, intervallePeriode, decalerReference, versISO } from '../lib/dates';
import { formatDateFr } from '../lib/format';

const hhmm = (t) => (t ? String(t).slice(0, 5) : '');
const nomJour = (iso) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(new Date(`${iso}T00:00:00`));

// Module admin — Plannings : présentiel des employés par semaine. Chaque créneau
// (employé + horaires) est une ligne indépendante → plusieurs employés peuvent
// être présents en même temps sans conflit. Écriture réservée à l'admin (RLS).
export default function Plannings() {
  const [reference, setReference] = useState(aujourdhuiISO());
  const [employes, setEmployes] = useState([]);
  const [creneaux, setCreneaux] = useState([]);
  const [form, setForm] = useState({ employe_id: '', date: aujourdhuiISO(), debut: '09:00', fin: '18:00' });
  const [msg, setMsg] = useState('');

  const [debut, fin] = intervallePeriode('semaine', reference);
  // 7 jours de la semaine (lundi → dimanche).
  const jours = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${debut}T00:00:00`);
    d.setDate(d.getDate() + i);
    return versISO(d);
  });

  useEffect(() => {
    supabase.rpc('collegues').then(({ data }) => setEmployes(data ?? []));
  }, []);

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('plannings')
      .select('id, employe_id, date, debut, fin')
      .gte('date', debut)
      .lte('date', fin)
      .order('date')
      .order('debut');
    setCreneaux(data ?? []);
  }, [debut, fin]);

  useEffect(() => {
    charger();
  }, [charger]);

  const nomEmploye = (id) => employes.find((e) => e.id === id)?.nom ?? '—';

  async function ajouter(e) {
    e.preventDefault();
    setMsg('');
    if (!form.employe_id || !form.date || !form.debut || !form.fin) {
      setMsg('Choisis un employé, une date et des horaires.');
      return;
    }
    if (form.fin <= form.debut) {
      setMsg('L’heure de fin doit être après l’heure de début.');
      return;
    }
    const { error } = await supabase.from('plannings').insert({
      employe_id: form.employe_id,
      date: form.date,
      debut: form.debut,
      fin: form.fin,
    });
    if (error) {
      setMsg(`Erreur : ${error.message}`);
      return;
    }
    setForm((f) => ({ ...f, debut: '09:00', fin: '18:00' }));
    charger();
  }

  async function supprimer(id) {
    await supabase.from('plannings').delete().eq('id', id);
    charger();
  }

  return (
    <div className="page">
      <h1>Plannings</h1>

      <div className="card filtres">
        <label className="field">
          <span>Semaine</span>
          <div className="nav-periode">
            <button
              type="button"
              className="btn btn-discret"
              onClick={() => setReference((r) => decalerReference('semaine', r, -1))}
              aria-label="Semaine précédente"
            >
              ‹
            </button>
            <input type="date" value={reference} onChange={(e) => setReference(e.target.value)} />
            <button
              type="button"
              className="btn btn-discret"
              onClick={() => setReference((r) => decalerReference('semaine', r, 1))}
              aria-label="Semaine suivante"
            >
              ›
            </button>
          </div>
        </label>
        <p className="periode-info">{formatDateFr(debut)} → {formatDateFr(fin)}</p>
      </div>

      <form className="card form-chrome" onSubmit={ajouter}>
        <h2>Ajouter un créneau</h2>
        <label className="field">
          <span>Employé</span>
          <select value={form.employe_id} onChange={(e) => setForm((f) => ({ ...f, employe_id: e.target.value }))}>
            <option value="" disabled>Choisir…</option>
            {employes.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.nom}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={form.date} min={debut} max={fin} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        </label>
        <div className="form-inline">
          <label className="field">
            <span>Début</span>
            <input type="time" value={form.debut} onChange={(e) => setForm((f) => ({ ...f, debut: e.target.value }))} />
          </label>
          <label className="field">
            <span>Fin</span>
            <input type="time" value={form.fin} onChange={(e) => setForm((f) => ({ ...f, fin: e.target.value }))} />
          </label>
        </div>
        <button className="btn btn-primary" type="submit">Ajouter au planning</button>
        {msg && <p className="statut">{msg}</p>}
      </form>

      {jours.map((j) => {
        const duJour = creneaux.filter((c) => c.date === j);
        return (
          <div key={j} className="card">
            <div className="entete-client">
              <h2 style={{ textTransform: 'capitalize' }}>
                {nomJour(j)} {j.slice(8, 10)}/{j.slice(5, 7)}
              </h2>
              {j === aujourdhuiISO() && <span className="badge badge-solde">Aujourd’hui</span>}
            </div>
            {duJour.length === 0 ? (
              <p className="vide">Personne de prévu.</p>
            ) : (
              <ul className="liste-planning">
                {duJour.map((c) => (
                  <li key={c.id} className="ligne-planning">
                    <span className="planning-emp">{nomEmploye(c.employe_id)}</span>
                    <span className="planning-horaire">{hhmm(c.debut)} – {hhmm(c.fin)}</span>
                    <button
                      type="button"
                      className="btn btn-discret"
                      onClick={() => supprimer(c.id)}
                      aria-label="Supprimer le créneau"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
