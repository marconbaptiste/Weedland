import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { parseMontant, formatEuros } from '../lib/format';
import { aujourdhuiISO, intervallePeriode, intervalleAnnee } from '../lib/dates';
import { resumeJour, somme } from '../lib/comptabilite';
import { lireBrouillon, ecrireBrouillon, effacerBrouillon } from '../lib/brouillon';
import ChampMontant from '../components/ChampMontant';

// Module 1 — Clôture de caisse journalière (par employé / par jour).
export default function Caisse() {
  const { utilisateur, profil, estAdmin } = useAuth();
  const tauxParDefaut = profil?.pourcentage_interessement ?? 0;
  const [date, setDate] = useState(aujourdhuiISO());
  const [form, setForm] = useState({
    cb: '',
    especes: '',
    fond_caisse: '',
    heures_travaillees: '',
    pourcentage_interessement: '',
    commentaire: '',
  });
  const [chromesJour, setChromesJour] = useState([]);
  const [caisseId, setCaisseId] = useState(null);
  const [collegues, setCollegues] = useState([]);
  // Co-participants sélectionnés : { employe_id, nom, heures }
  const [partageurs, setPartageurs] = useState([]);
  const [statut, setStatut] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const [stats, setStats] = useState({ caMois: 0, intMois: 0, caAnnee: 0, intAnnee: 0 });

  // Brouillon (survit au changement d'onglet) : prêt seulement après chargement,
  // pour ne pas écraser le brouillon avec l'état vide initial.
  const cleBrouillon = `brouillon-caisse:${utilisateur.id}:${date}`;
  const pret = useRef(false);

  const maj = (champ) => (valeur) => setForm((f) => ({ ...f, [champ]: valeur }));

  // Liste des collègues (hors soi-même) pour le partage de journée.
  useEffect(() => {
    supabase
      .from('v_collegues')
      .select('id, nom')
      .order('nom')
      .then(({ data }) => setCollegues((data ?? []).filter((c) => c.id !== utilisateur.id)));
  }, [utilisateur.id]);

  // Statistiques personnelles (CA + intéressement, mois et année en cours).
  const chargerStats = useCallback(async () => {
    const [aDeb, aFin] = intervalleAnnee();
    const [mDeb, mFin] = intervallePeriode('mois');
    const { data } = await supabase
      .from('v_interessement_employe')
      .select('date, est_proprietaire, ca_jour, interessement')
      .eq('employe_id', utilisateur.id)
      .gte('date', aDeb)
      .lte('date', aFin);
    const lignes = data ?? [];
    const dansMois = (d) => d >= mDeb && d <= mFin;
    setStats({
      caMois: somme(lignes.filter((l) => l.est_proprietaire && dansMois(l.date)).map((l) => l.ca_jour)),
      intMois: somme(lignes.filter((l) => dansMois(l.date)).map((l) => l.interessement)),
      caAnnee: somme(lignes.filter((l) => l.est_proprietaire).map((l) => l.ca_jour)),
      intAnnee: somme(lignes.map((l) => l.interessement)),
    });
  }, [utilisateur.id]);

  useEffect(() => {
    chargerStats();
  }, [chargerStats]);

  // Charge la clôture existante + chromes du jour + co-participants éventuels.
  // Si un brouillon non enregistré existe pour ce jour, il est restauré en priorité.
  const charger = useCallback(async () => {
    setStatut('');
    pret.current = false;
    const cle = `brouillon-caisse:${utilisateur.id}:${date}`;

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
    setCaisseId(caisse?.id ?? null);

    const brouillon = lireBrouillon(cle);
    if (brouillon?.form) {
      setForm(brouillon.form);
      setPartageurs(brouillon.partageurs ?? []);
    } else if (caisse) {
      setForm({
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
        cb: '',
        especes: '',
        fond_caisse: '',
        heures_travaillees: '',
        pourcentage_interessement: tauxParDefaut ? String(tauxParDefaut) : '',
        commentaire: '',
      });
      setPartageurs([]);
    }
    pret.current = true;
  }, [utilisateur.id, date, tauxParDefaut]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Sauvegarde le brouillon à chaque modification (après le chargement initial).
  useEffect(() => {
    if (!pret.current) return;
    ecrireBrouillon(cleBrouillon, { form, partageurs });
  }, [form, partageurs, cleBrouillon]);

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

  // Calculs temps réel. CA du jour = CB + espèces + avances − remboursements.
  // (« ventes directes » = encaissé sur place = CB + espèces.)
  const cbNum = parseMontant(form.cb);
  const especesNum = parseMontant(form.especes);
  const resume = resumeJour(
    {
      ventes_directes: cbNum + especesNum,
      cb: cbNum,
      especes: especesNum,
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
          ventes_directes: parseMontant(form.cb) + parseMontant(form.especes),
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
      setStatut(`Erreur : ${error?.message ?? 'enregistrement impossible'}`);
      return;
    }

    setCaisseId(ligne.id);

    // Remplace les co-participants de cette clôture.
    await supabase.from('caisse_partage').delete().eq('caisse_id', ligne.id);
    if (partageurs.length > 0) {
      const { error: errPartage } = await supabase.from('caisse_partage').insert(
        partageurs.map((p) => ({
          caisse_id: ligne.id,
          employe_id: p.employe_id,
          heures_travaillees: parseMontant(p.heures),
        })),
      );
      if (errPartage) {
        setEnregistrement(false);
        setStatut(`Clôture enregistrée, mais partage en erreur : ${errPartage.message}`);
        return;
      }
    }

    // Recharge depuis la base pour confirmer la persistance et rafraîchir le récap.
    effacerBrouillon(cleBrouillon);
    await charger();
    await chargerStats();
    setEnregistrement(false);
    setStatut('Clôture enregistrée ✅');
  }

  async function supprimerCloture() {
    if (!caisseId) return;
    if (!window.confirm('Supprimer cette clôture ? Cette action est irréversible.')) return;
    const { error } = await supabase.from('caisse_jour').delete().eq('id', caisseId);
    if (error) {
      setStatut('Suppression impossible.');
      return;
    }
    setCaisseId(null);
    setPartageurs([]);
    setForm({
      cb: '',
      especes: '',
      fond_caisse: '',
      heures_travaillees: '',
      pourcentage_interessement: tauxParDefaut ? String(tauxParDefaut) : '',
      commentaire: '',
    });
    setStatut('Clôture supprimée.');
    chargerStats();
  }

  return (
    <div className="page">
      <h1>Clôture de caisse</h1>

      <div className="card">
        <div className="histo-tete">
          <strong>{profil?.nom}</strong>
          <span className="badge badge-solde">{estAdmin ? 'Admin' : 'Employé'}</span>
        </div>
        <div className="cartes-kpi">
          <div className="kpi">
            <span className="kpi-label">CA du mois</span>
            <span className="kpi-valeur">{formatEuros(stats.caMois)}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Intéressement du mois</span>
            <span className="kpi-valeur">{formatEuros(stats.intMois)}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">CA de l’année</span>
            <span className="kpi-valeur">{formatEuros(stats.caAnnee)}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Intéressement de l’année</span>
            <span className="kpi-valeur">{formatEuros(stats.intAnnee)}</span>
          </div>
        </div>
      </div>

      <label className="field">
        <span>Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      <div className="grille-caisse">
        <div className="col">
          <form className="card" onSubmit={enregistrer}>
        <ChampMontant label="Encaissements CB" valeur={form.cb} onChange={maj('cb')} autoFocus />
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
        {caisseId && (
          <button type="button" className="btn btn-discret" onClick={supprimerCloture}>
            Supprimer la clôture
          </button>
        )}
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
        </div>

        <div className="col">
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
        <p className="statut">CA = CB + espèces + avances − remboursements.</p>
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
      </div>
    </div>
  );
}
