import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { aujourdhuiISO, versISO, premierDuMois } from '../lib/dates';
import { formatDateFr } from '../lib/format';

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const hhmm = (t) => (t ? String(t).slice(0, 5) : '');

function couleurEmploye(id) {
  let h = 0;
  for (let i = 0; i < (id ?? '').length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 42%)`;
}

// Calendrier mensuel du planning en LECTURE SEULE (accueil, pour tous). Navigation
// par mois, chips colorées par employé ; touche un jour → détail du jour (sans
// modification). Les données restent cloisonnées par la RLS (lecture membres).
export default function CalendrierLecture() {
  const [mois, setMois] = useState(premierDuMois());
  const [employes, setEmployes] = useState([]);
  const [creneaux, setCreneaux] = useState([]);
  const [jourSel, setJourSel] = useState(aujourdhuiISO());

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

  const cases = [
    ...Array.from({ length: debutSemaine }, () => null),
    ...Array.from({ length: nbJours }, (_, i) => versISO(new Date(annee, moisNum, i + 1))),
  ];

  return (
    <div className="card">
      <div className="cal-tete">
        <button type="button" className="btn btn-discret" onClick={() => changerMois(-1)} aria-label="Mois précédent">‹</button>
        <strong style={{ textTransform: 'capitalize' }}>Planning — {nomMois} {annee}</strong>
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
              className={`cal-jour ${iso === aujourdhuiISO() ? 'cal-aujourdhui' : ''} ${iso === jourSel ? 'cal-selection' : ''}`}
              onClick={() => setJourSel(iso)}
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

      {jourSel && (
        <div className="cal-detail">
          <strong style={{ textTransform: 'capitalize' }}>{formatDateFr(jourSel)}</strong>
          {duJour(jourSel).length === 0 ? (
            <p className="vide">Personne de prévu ce jour.</p>
          ) : (
            <ul className="liste-planning">
              {duJour(jourSel).map((c) => (
                <li key={c.id} className="ligne-planning">
                  <span className="cal-pastille" style={{ background: couleurEmploye(c.employe_id) }} />
                  <span className="planning-emp">{nomEmploye(c.employe_id)}</span>
                  <span className="planning-horaire">{hhmm(c.debut)} – {hhmm(c.fin)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
