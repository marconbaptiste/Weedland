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

// Liste des dates ISO de a à b inclus.
function joursEntre(a, b) {
  const out = [];
  const d = new Date(`${a}T00:00:00`);
  const fin = new Date(`${b}T00:00:00`);
  while (d <= fin) {
    out.push(versISO(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// Module admin — Plannings, calendrier mensuel. On sélectionne un jour, OU une
// PLAGE de jours (1er clic = début, 2e clic = fin, comme un aller/retour), puis
// on ajoute un créneau (employé + horaires) à toute la période d'un coup.
// Plusieurs employés le même jour = plusieurs chips. Écriture admin (RLS).
export default function Plannings() {
  const [mois, setMois] = useState(premierDuMois());
  const [employes, setEmployes] = useState([]);
  const [creneaux, setCreneaux] = useState([]);
  const [plage, setPlage] = useState(null); // { debut, fin|null }
  const [form, setForm] = useState({ employe_id: '', debut: '09:00', fin: '18:00' });
  const [msg, setMsg] = useState('');

  const ref = new Date(`${mois}T00:00:00`);
  const annee = ref.getFullYear();
  const moisNum = ref.getMonth();
  const nomMois = new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(ref);
  const nbJours = new Date(annee, moisNum + 1, 0).getDate();
  const debutSemaine = (new Date(annee, moisNum, 1).getDay() + 6) % 7;
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

  // Clic sur un jour : 1er = début, 2e = fin (ordonnée), 3e = repart à zéro.
  function cliquerJour(iso) {
    setMsg('');
    setPlage((p) => {
      if (!p || p.fin) return { debut: iso, fin: null };
      if (iso === p.debut) return { debut: iso, fin: iso };
      return iso < p.debut ? { debut: iso, fin: p.debut } : { debut: p.debut, fin: iso };
    });
  }

  const finEff = plage ? plage.fin ?? plage.debut : null;
  const dansPlage = (iso) => plage && iso >= plage.debut && iso <= finEff;
  const joursSel = plage ? joursEntre(plage.debut, finEff) : [];
  const unSeulJour = joursSel.length === 1;

  async function ajouter(e) {
    e.preventDefault();
    setMsg('');
    if (!form.employe_id) return setMsg('Choisis un employé.');
    if (form.fin <= form.debut) return setMsg('La fin doit être après le début.');
    const lignes = joursSel.map((j) => ({
      employe_id: form.employe_id,
      date: j,
      debut: form.debut,
      fin: form.fin,
    }));
    const { error } = await supabase.from('plannings').insert(lignes);
    if (error) return setMsg(`Erreur : ${error.message}`);
    setForm((f) => ({ ...f, debut: '09:00', fin: '18:00' }));
    return charger();
  }

  async function supprimer(id) {
    await supabase.from('plannings').delete().eq('id', id);
    charger();
  }

  const cases = [
    ...Array.from({ length: debutSemaine }, () => null),
    ...Array.from({ length: nbJours }, (_, i) => versISO(new Date(annee, moisNum, i + 1))),
  ];

  return (
    <div className="page">
      <h1>Plannings</h1>

      <div className="card">
        <div className="cal-tete">
          <button type="button" className="btn btn-discret" onClick={() => changerMois(-1)} aria-label="Mois précédent">‹</button>
          <strong style={{ textTransform: 'capitalize' }}>{nomMois} {annee}</strong>
          <button type="button" className="btn btn-discret" onClick={() => changerMois(1)} aria-label="Mois suivant">›</button>
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
                className={`cal-jour ${iso === aujourdhuiISO() ? 'cal-aujourdhui' : ''} ${dansPlage(iso) ? 'cal-selection' : ''}`}
                onClick={() => cliquerJour(iso)}
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
        <p className="statut">
          Touche un jour, puis un 2ᵉ pour sélectionner une <strong>période</strong> (aller/retour).
        </p>
      </div>

      {plage && (
        <div className="card">
          <div className="entete-client">
            <h2 style={{ textTransform: 'capitalize' }}>
              {unSeulJour
                ? formatDateFr(plage.debut)
                : `Du ${formatDateFr(plage.debut)} au ${formatDateFr(finEff)} · ${joursSel.length} jours`}
            </h2>
            <button type="button" className="btn btn-discret" onClick={() => setPlage(null)}>Effacer</button>
          </div>

          {unSeulJour &&
            (duJour(plage.debut).length === 0 ? (
              <p className="vide">Personne de prévu ce jour.</p>
            ) : (
              <ul className="liste-planning">
                {duJour(plage.debut).map((c) => (
                  <li key={c.id} className="ligne-planning">
                    <span className="cal-pastille" style={{ background: couleurEmploye(c.employe_id) }} />
                    <span className="planning-emp">{nomEmploye(c.employe_id)}</span>
                    <span className="planning-horaire">{hhmm(c.debut)} – {hhmm(c.fin)}</span>
                    <button type="button" className="btn btn-discret" onClick={() => supprimer(c.id)} aria-label="Supprimer">✕</button>
                  </li>
                ))}
              </ul>
            ))}
          {!unSeulJour && (
            <p className="statut">Le créneau sera ajouté à chacun des {joursSel.length} jours sélectionnés.</p>
          )}

          <form className="form-chrome" onSubmit={ajouter}>
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
            <button className="btn btn-primary" type="submit">
              {unSeulJour ? 'Ajouter' : `Ajouter à ${joursSel.length} jours`}
            </button>
            {msg && <p className="statut">{msg}</p>}
          </form>
        </div>
      )}
    </div>
  );
}
