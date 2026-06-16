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
  const [statut, setStatut] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  const maj = (champ) => (valeur) => setForm((f) => ({ ...f, [champ]: valeur }));

  // Charge la clôture existante + les chromes du jour pour cet employé.
  const charger = useCallback(async () => {
    setStatut('');
    const [caisse, chromes] = await Promise.all([
      supabase
        .from('caisse_jour')
        .select('*')
        .eq('employe_id', utilisateur.id)
        .eq('date', date)
        .maybeSingle(),
      supabase
        .from('chromes')
        .select('type, montant')
        .eq('employe_id', utilisateur.id)
        .eq('date', date),
    ]);

    if (caisse.data) {
      setForm({
        ventes_directes: String(caisse.data.ventes_directes),
        cb: String(caisse.data.cb),
        especes: String(caisse.data.especes),
        fond_caisse: String(caisse.data.fond_caisse),
        heures_travaillees: String(caisse.data.heures_travaillees ?? ''),
        pourcentage_interessement: String(caisse.data.pourcentage_interessement ?? ''),
        commentaire: caisse.data.commentaire ?? '',
      });
    } else {
      // Nouvelle clôture : on pré-remplit le taux depuis la fiche employé.
      setForm({
        ventes_directes: '',
        cb: '',
        especes: '',
        fond_caisse: '',
        heures_travaillees: '',
        pourcentage_interessement: tauxParDefaut ? String(tauxParDefaut) : '',
        commentaire: '',
      });
    }
    setChromesJour(chromes.data ?? []);
  }, [utilisateur.id, date, tauxParDefaut]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Calculs temps réel (logique CA/chromes/intéressement centralisée).
  const resume = resumeJour(
    {
      ventes_directes: parseMontant(form.ventes_directes),
      cb: parseMontant(form.cb),
      especes: parseMontant(form.especes),
      pourcentage_interessement: parseMontant(form.pourcentage_interessement),
    },
    chromesJour,
  );

  async function enregistrer(e) {
    e.preventDefault();
    setEnregistrement(true);
    setStatut('');
    const { error } = await supabase.from('caisse_jour').upsert(
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
    );
    setEnregistrement(false);
    setStatut(error ? 'Erreur lors de l’enregistrement.' : 'Clôture enregistrée ✅');
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
            Intéressement
            {parseMontant(form.pourcentage_interessement) > 0 &&
              ` (${form.pourcentage_interessement} % · ${form.heures_travaillees || 0} h)`}
          </span>
          <strong>{formatEuros(resume.interessement)}</strong>
        </div>
      </div>
    </div>
  );
}
