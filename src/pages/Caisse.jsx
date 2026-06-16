import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { parseMontant, formatEuros } from '../lib/format';
import { aujourdhuiISO } from '../lib/dates';
import { resumeJour } from '../lib/comptabilite';
import ChampMontant from '../components/ChampMontant';

// Module 1 — Clôture de caisse journalière (par employé / par jour).
export default function Caisse() {
  const { utilisateur, profil } = useAuth();
  const tauxParDefaut = profil?.pourcentage_interessement ?? 0;
  const [date, setDate] = useState(aujourdhuiISO());
  const [form, setForm] = useState({
    ventes_directes: '',
    cb: '',
    especes: '',
    fond_caisse: '',
    heures_travaillees: '',
    pourcentage_interessement: '',
    commentaire: '',
  });
  const [chromesJour, setChromesJour] = useState([]);
  const [collegues, setCollegues] = useState([]);
  // Co-participants sélectionnés : { employe_id, nom, heures }
  const [partageurs, setPartageurs] = useState([]);
  const [statut, setStatut] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  const maj = (champ) => (valeur) => setForm((f) => ({ ...f, [champ]: valeur }));

  // Liste des collègues (hors soi-même) pour le partage de journée.
  useEffect(() => {
    supabase
      .from('v_collegues')
      .select('id, nom')
      .order('nom')
      .then(({ data }) => setCollegues((data ?? []).filter((c) => c.id !== utilisateur.id)));
  }, [utilisateur.id]);

  // Charge la clôture existante + chromes du jour + co-participants éventuels.
  const charger = useCallback(async () => {
    setStatut('');
    const { data: caisse } = await supabase
      .from('caisse_jour')
      .select('*')
      .eq('employe_id', utilisateur.id)
      .eq('date', date)
      .maybeSingle();

    const { data: chromes } = await supabase
      .from('chromes')
      .select('type, montant')
      .eq('employe_id', utilisateur.id)
      .eq('date', date);
    setChromesJour(chromes ?? []);

    if (caisse) {
      setForm({
        ventes_directes: String(caisse.ventes_directes),
        cb: String(caisse.cb),
        especes: String(caisse.especes),
        fond_caisse: String(caisse.fond_caisse),
        heures_travaillees: String(caisse.heures_travaillees ?? ''),
        pourcentage_interessement: String(caisse.pourcentage_interessement ?? ''),
        commentaire: caisse.commentaire ?? '',
      });
      const { data: parts } = await supabase
        .from('caisse_partage')
        .select('employe_id, heures_travaillees')
        .eq('caisse_id', caisse.id);
      setPartageurs(
        (parts ?? []).map((p) => ({
          employe_id: p.employe_id,
          heures: String(p.heures_travaillees ?? ''),
        })),
      );
    } else {
      setForm({
        ventes_directes: '',
        cb: '',
        especes: '',
        fond_caisse: '',
        heures_travaillees: '',
        pourcentage_interessement: tauxParDefaut ? String(tauxParDefaut) : '',
        commentaire: '',
      });
      setPartageurs([]);
    }
  }, [utilisateur.id, date, tauxParDefaut]);

  useEffect(() => {
    charger();
  }, [charger]);

  const nbPartageurs = 1 + partageurs.length;

  function basculerCollegue(id) {
    setPartageurs((liste) =>
      liste.some((p) => p.employe_id === id)
        ? liste.filter((p) => p.employe_id !== id)
        : [...liste, { employe_id: id, heures: '' }],
    );
  }

  function majHeuresPartage(id, valeur) {
    setPartageurs((liste) =>
      liste.map((p) => (p.employe_id === id ? { ...p, heures: valeur } : p)),
    );
  }

  // Calculs temps réel (CA/chromes/intéressement, divisé par le nb de personnes).
  const resume = resumeJour(
    {
      ventes_directes: parseMontant(form.ventes_directes),
      cb: parseMontant(form.cb),
      especes: parseMontant(form.especes),
      pourcentage_interessement: parseMontant(form.pourcentage_interessement),
      nb_partageurs: nbPartageurs,
    },
    chromesJour,
  );

  async function enregistrer(e) {
    e.preventDefault();
    setEnregistrement(true);
    setStatut('');
    const { data: ligne, error } = await supabase
      .from('caisse_jour')
      .upsert(
        {
          employe_id: utilisateur.id,
          date,
          ventes_directes: parseMontant(form.ventes_directes),
          cb: parseMontant(form.cb),
          especes: parseMontant(form.especes),
          fond_caisse: parseMontant(form.fond_caisse),
          heures_travaillees: parseMontant(form.heures_travaillees),
          pourcentage_interessement: parseMontant(form.pourcentage_interessement),
          commentaire: form.commentaire || null,
        },
        { onConflict: 'employe_id,date' },
      )
      .select()
      .single();

    if (error || !ligne) {
      setEnregistrement(false);
      setStatut('Erreur lors de l’enregistrement.');
      return;
    }

    // Remplace les co-participants de cette clôture.
    await supabase.from('caisse_partage').delete().eq('caisse_id', ligne.id);
    if (partageurs.length > 0) {
      await supabase.from('caisse_partage').insert(
        partageurs.map((p) => ({
          caisse_id: ligne.id,
          employe_id: p.employe_id,
          heures_travaillees: parseMontant(p.heures),
        })),
      );
    }

    setEnregistrement(false);
    setStatut('Clôture enregistrée ✅');
  }

  const { reconciliation: reco } = resume;

  return (
    <div className="page">
      <h1>Clôture de caisse</h1>

      <label className="field">
        <span>Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      <form className="card" onSubmit={enregistrer}>
        <ChampMontant label="Ventes directes" valeur={form.ventes_directes} onChange={maj('ventes_directes')} autoFocus />
        <ChampMontant label="Encaissements CB" valeur={form.cb} onChange={maj('cb')} />
        <ChampMontant label="Espèces (Moro)" valeur={form.especes} onChange={maj('especes')} />
        <ChampMontant label="Fond de caisse" valeur={form.fond_caisse} onChange={maj('fond_caisse')} />
        <label className="field">
          <span>Heures travaillées</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="ex. 6,5"
            value={form.heures_travaillees}
            onChange={(e) => maj('heures_travaillees')(e.target.value)}
          />
        </label>
        <label className="field">
          <span>% d’intéressement</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="ex. 5"
            value={form.pourcentage_interessement}
            onChange={(e) => maj('pourcentage_interessement')(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Commentaire</span>
          <textarea
            rows={2}
            value={form.commentaire}
            onChange={(e) => maj('commentaire')(e.target.value)}
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={enregistrement}>
          {enregistrement ? 'Enregistrement…' : 'Enregistrer la clôture'}
        </button>
        {statut && <p className="statut">{statut}</p>}
      </form>

      <div className="card">
        <h2>Journée partagée</h2>
        <p className="statut">
          Cochez les collègues présents <strong>en même temps</strong> que vous. L’intéressement
          sera réparti à parts égales (CA ÷ nombre de personnes). Une seule personne saisit la
          clôture ; les autres ne créent pas la leur ce jour-là.
        </p>
        <ul className="liste-partage">
          {collegues.map((c) => {
            const sel = partageurs.find((p) => p.employe_id === c.id);
            return (
              <li key={c.id} className="ligne-partage">
                <label className="case-partage">
                  <input
                    type="checkbox"
                    checked={Boolean(sel)}
                    onChange={() => basculerCollegue(c.id)}
                  />
                  <span>{c.nom}</span>
                </label>
                {sel && (
                  <input
                    className="champ-pourcentage"
                    type="text"
                    inputMode="decimal"
                    placeholder="heures"
                    value={sel.heures}
                    onChange={(e) => majHeuresPartage(c.id, e.target.value)}
                  />
                )}
              </li>
            );
          })}
          {collegues.length === 0 && <li className="vide">Aucun autre employé.</li>}
        </ul>
      </div>

      <div className="card recap">
        <h2>Récapitulatif du jour</h2>
        <div className="recap-ligne">
          <span>Avances (chromes)</span>
          <strong>{formatEuros(resume.avances)}</strong>
        </div>
        <div className="recap-ligne">
          <span>Remboursements (chromes)</span>
          <strong>{formatEuros(resume.remboursements)}</strong>
        </div>
        <hr />
        <div className="recap-paire">
          <div className="recap-bloc">
            <span className="recap-label">CA du jour</span>
            <span className="recap-valeur">{formatEuros(resume.ca)}</span>
          </div>
          <div className="recap-bloc">
            <span className="recap-label">Encaissements</span>
            <span className="recap-valeur">{formatEuros(resume.encaissements)}</span>
          </div>
        </div>
        <div className={`voyant ${reco.coherent ? 'voyant-vert' : 'voyant-rouge'}`}>
          {reco.coherent
            ? '● Caisse cohérente'
            : `● Écart de caisse : ${formatEuros(reco.ecart)} (attendu ${formatEuros(reco.attendu)})`}
        </div>
        <hr />
        <div className="recap-ligne">
          <span>
            Votre intéressement
            {parseMontant(form.pourcentage_interessement) > 0 &&
              ` (${form.pourcentage_interessement} %${nbPartageurs > 1 ? ` · CA ÷ ${nbPartageurs}` : ''})`}
          </span>
          <strong>{formatEuros(resume.interessement)}</strong>
        </div>
      </div>
    </div>
  );
}
