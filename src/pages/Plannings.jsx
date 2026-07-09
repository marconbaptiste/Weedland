import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { aujourdhuiISO, versISO, premierDuMois } from '../lib/dates';
import { formatDateFr } from '../lib/format';

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

// Couleur stable par employé (pour distinguer les présences simultanées).
function couleurEmploye(id) {
  let h = 0;
  for (let i = 0; i < (id ?? '').length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 42%)`;
}

// Module admin — Plannings sous forme de VRAI calendrier mensuel. Chaque jour
// affiche les employés présents (chips colorées). Un clic sur un jour ouvre le
// détail (ajouter / supprimer des créneaux). Plusieurs employés le même jour =
// plusieurs chips. Écriture réservée à l'admin (RLS).
export default function Plannings() {
  const [mois, setMois] = useState(premierDuMois()); // AAAA-MM-01
  const [employes, setEmployes] = useState([]);
  const [creneaux, setCreneaux] = useState([]);
  const [jourSel, setJourSel] = useState(null); // date ISO cliquée
  const [form, setForm] = useState({ employe_id: '', debut: '09:00', fin: '18:00' });
  const [msg, setMsg] = useState('');

  const ref = new Date(`${mois}T00:00:00`);
  const annee = ref.getFullYear();
  const moisNum = ref.getMonth();
  const nomMois = new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(ref);
  const nbJours = new Date(annee, moisNum + 1, 0).getDate();
  const debutSemaine = (new Date(annee, moisNum, 1).getDay() + 6) % 7; // lundi = 0
  const finMois = versISO(new Date(annee, moisNum + 1, 0));

  useEffect(() => {
    supabase.rpc('collegues').then(({ data }) => setEmployes(data ?? []));
  }, []);

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('plannings')
      .select('id, employe_id, date, debut, fin')
      .gte('date', mois)
      .lte('date', finMois)
      .order('debut');
    setCreneaux(data ?? []);
  }, [mois, finMois]);

  useEffect(() => {
    charger();
  }, [charger]);

  const nomEmploye = (id) => employes.find((e) => e.id === id)?.nom ?? '—';
  const prenom = (id) => nomEmploye(id).split(' ')[0];
  const duJour = (iso) => creneaux.filter((c) => c.date === iso);

  const changerMois = (sens) => setMois(versISO(new Date(annee, moisNum + sens, 1)));

  async function ajouter(e) {
    e.preventDefault();
    setMsg('');
    if (!form.employe_id) return setMsg('Choisis un employé.');
    if (form.fin <= form.debut) return setMsg('La fin doit être après le début.');
    const { error } = await supabase
      .from('plannings')
      .insert({ employe_id: form.employe_id, date: jourSel, debut: form.debut, fin: form.fin });
    if (error) return setMsg(`Erreur : ${error.message}`);
    setForm((f) => ({ ...f, debut: '09:00', fin: '18:00' }));
    return charger();
  }

  async function supprimer(id) {
    await supabase.from('plannings').delete().eq('id', id);
    charger();
  }

  // Cellules : cases vides avant le 1er, puis les jours du mois.
  const cases = [
    ...Array.from({ length: debutSemaine }, () => null),
    ...Array.from({ length: nbJours }, (_, i) => versISO(new Date(annee, moisNum, i + 1))),
  ];

  return (
    <div className="page">
      <h1>Plannings</h1>

      <div className="card">
        <div className="cal-tete">
          <button type="button" className="btn btn-discret" onClick={() => changerMois(-1)} aria-label="Mois précédent">
            ‹
          </button>
          <strong style={{ textTransform: 'capitalize' }}>{nomMois} {annee}</strong>
          <button type="button" className="btn btn-discret" onClick={() => changerMois(1)} aria-label="Mois suivant">
            ›
          </button>
        </div>

        <div className="calendrier">
          {JOURS.map((j) => (
            <div key={j} className="cal-entete">{j}</div>
          ))}
          {cases.map((iso, i) =>
            iso === null ? (
              <div key={`v${i}`} className="cal-jour cal-vide" />
            ) : (
              <button
                key={iso}
                type="button"
                className={`cal-jour ${iso === aujourdhuiISO() ? 'cal-aujourdhui' : ''}`}
                onClick={() => {
                  setJourSel(iso);
                  setMsg('');
                }}
              >
                <span className="cal-num">{Number(iso.slice(8, 10))}</span>
                <span className="cal-chips">
                  {duJour(iso).slice(0, 3).map((c) => (
                    <span key={c.id} className="cal-chip" style={{ background: couleurEmploye(c.employe_id) }}>
                      {prenom(c.employe_id)}
                    </span>
                  ))}
                  {duJour(iso).length > 3 && <span className="cal-plus">+{duJour(iso).length - 3}</span>}
                </span>
              </button>
            ),
          )}
        </div>
        <p className="statut">Touche un jour pour voir / ajouter des créneaux.</p>
      </div>

      {jourSel && (
        <div className="aide-fond" role="dialog" aria-modal="true" aria-label="Créneaux du jour" onClick={() => setJourSel(null)}>
          <div className="modale-client" onClick={(e) => e.stopPropagation()}>
            <div className="modale-client-tete">
              <strong style={{ textTransform: 'capitalize' }}>{formatDateFr(jourSel)}</strong>
              <button type="button" className="btn btn-discret" onClick={() => setJourSel(null)}>Fermer</button>
            </div>

            {duJour(jourSel).length === 0 ? (
              <p className="vide">Personne de prévu ce jour.</p>
            ) : (
              <ul className="liste-planning">
                {duJour(jourSel).map((c) => (
                  <li key={c.id} className="ligne-planning">
                    <span className="cal-pastille" style={{ background: couleurEmploye(c.employe_id) }} />
                    <span className="planning-emp">{nomEmploye(c.employe_id)}</span>
                    <span className="planning-horaire">{hhmm(c.debut)} – {hhmm(c.fin)}</span>
                    <button type="button" className="btn btn-discret" onClick={() => supprimer(c.id)} aria-label="Supprimer">✕</button>
                  </li>
                ))}
              </ul>
            )}

            <form className="form-chrome" onSubmit={ajouter}>
              <h3>Ajouter un créneau</h3>
              <label className="field">
                <span>Employé</span>
                <select value={form.employe_id} onChange={(e) => setForm((f) => ({ ...f, employe_id: e.target.value }))}>
                  <option value="" disabled>Choisir…</option>
                  {employes.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.nom}</option>
                  ))}
                </select>
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
              <button className="btn btn-primary" type="submit">Ajouter</button>
              {msg && <p className="statut">{msg}</p>}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
