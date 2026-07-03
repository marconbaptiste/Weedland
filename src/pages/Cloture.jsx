import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { parseMontant, formatEuros } from '../lib/format';
import { aujourdhuiISO } from '../lib/dates';
import { resumeJour, somme, interessement } from '../lib/comptabilite';
import { lireBrouillon, ecrireBrouillon, effacerBrouillon } from '../lib/brouillon';
import ChampMontant from '../components/ChampMontant';

// Module 1 — Clôture de caisse journalière (par employé / par jour).
export default function Cloture() {
  const { utilisateur, profil } = useAuth();
  const tauxParDefaut = profil?.pourcentage_interessement ?? 0;
  const [date, setDate] = useState(aujourdhuiISO());
  const [form, setForm] = useState({
    cb: '',
    especes: '',
    fond_caisse: '',
    heures_travaillees: '',
    commentaire: '',
  });
  const [chromesJour, setChromesJour] = useState([]);
  const [caisseId, setCaisseId] = useState(null);
  const [collegues, setCollegues] = useState([]);
  // Co-participants sélectionnés : { employe_id, nom, heures }
  const [partageurs, setPartageurs] = useState([]);
  const [statut, setStatut] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  // CA « tel que déclaré » d'une clôture existante (avant toute modification).
  const [ventesDeclarees, setVentesDeclarees] = useState(null);
  const [modifie, setModifie] = useState(false);

  // Brouillon (survit au changement d'onglet) : prêt seulement après chargement,
  // pour ne pas écraser le brouillon avec l'état vide initial.
  const cleBrouillon = `brouillon-caisse:${utilisateur.id}:${date}`;
  const pret = useRef(false);

  const maj = (champ) => (valeur) => {
    setModifie(true);
    setForm((f) => ({ ...f, [champ]: valeur }));
  };

  // Liste des collègues (hors soi-même) pour le partage de journée.
  useEffect(() => {
    supabase
      .rpc('collegues')
      .then(({ data }) => setCollegues((data ?? []).filter((c) => c.id !== utilisateur.id)));
  }, [utilisateur.id]);

  // Charge la clôture existante + chromes du jour + co-participants éventuels.
  // Si un brouillon non enregistré existe pour ce jour, il est restauré en priorité.
  const charger = useCallback(async () => {
    setStatut('');
    pret.current = false;
    const cle = `brouillon-caisse:${utilisateur.id}:${date}`;

    // Les deux lectures sont indépendantes → en parallèle.
    const [{ data: caisse }, { data: chromes }] = await Promise.all([
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
    setChromesJour(chromes ?? []);
    setCaisseId(caisse?.id ?? null);

    const brouillon = lireBrouillon(cle);
    setVentesDeclarees(caisse ? caisse.ventes_directes : null);
    if (brouillon?.form) {
      setForm(brouillon.form);
      setPartageurs(brouillon.partageurs ?? []);
      setModifie(true); // brouillon = saisie en cours, on recalcule
    } else if (caisse) {
      setForm({
        cb: String(caisse.cb),
        especes: String(caisse.especes),
        fond_caisse: String(caisse.fond_caisse),
        heures_travaillees: String(caisse.heures_travaillees ?? ''),
        commentaire: caisse.commentaire ?? '',
      });
      setModifie(false); // clôture existante affichée telle que déclarée
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
        commentaire: '',
      });
      setPartageurs([]);
      setModifie(false);
    }
    pret.current = true;
  }, [utilisateur.id, date, tauxParDefaut]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Rafraîchit les chromes du jour (avances/remboursements → récap) au retour sur
  // l'onglet/la page : si un chrome a été saisi ailleurs (page Clients), le récap
  // se met à jour sans toucher à la saisie en cours du formulaire.
  useEffect(() => {
    const recharger = async () => {
      if (document.hidden) return;
      const { data } = await supabase
        .from('chromes')
        .select('type, montant')
        .eq('employe_id', utilisateur.id)
        .eq('date', date);
      setChromesJour(data ?? []);
    };
    document.addEventListener('visibilitychange', recharger);
    window.addEventListener('focus', recharger);
    return () => {
      document.removeEventListener('visibilitychange', recharger);
      window.removeEventListener('focus', recharger);
    };
  }, [utilisateur.id, date]);

  // Sauvegarde le brouillon à chaque modification (après le chargement initial).
  useEffect(() => {
    if (!pret.current) return;
    ecrireBrouillon(cleBrouillon, { form, partageurs });
  }, [form, partageurs, cleBrouillon]);

  // Diviseur de l'intéressement : seules les personnes au taux > 0 prennent
  // une part (un collègue à 0 % ne dilue pas l'intéressement des autres).
  const tauxCollegue = (id) =>
    collegues.find((c) => c.id === id)?.pourcentage_interessement ?? 0;
  const nbInteresses =
    (tauxParDefaut > 0 ? 1 : 0) +
    partageurs.filter((p) => tauxCollegue(p.employe_id) > 0).length;
  const diviseur = Math.max(nbInteresses, 1);

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
  // Le taux d'intéressement vient du compte (Comptes), jamais saisi par clôture.
  const resume = resumeJour(
    {
      ventes_directes: cbNum + especesNum,
      cb: cbNum,
      especes: especesNum,
      pourcentage_interessement: tauxParDefaut,
      nb_partageurs: diviseur,
    },
    chromesJour,
  );

  // Clôture existante non modifiée -> on affiche le CA tel qu'il a été déclaré
  // (et non recalculé). Dès qu'on édite un champ, on repasse au calcul auto.
  const afficherDeclare = Boolean(caisseId) && !modifie && ventesDeclarees != null;
  const caAffiche = afficherDeclare
    ? somme([ventesDeclarees, resume.avances, -resume.remboursements])
    : resume.ca;
  const intAffiche = afficherDeclare
    ? interessement(caAffiche, tauxParDefaut, diviseur)
    : resume.interessement;

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
          pourcentage_interessement: tauxParDefaut,
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
      commentaire: '',
    });
    setStatut('Clôture supprimée.');
  }

  return (
    <div className="page">
      <h1>Clôture de caisse</h1>

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
        <p className="statut">
          Taux d’intéressement : <strong>{tauxParDefaut} %</strong> (défini dans Comptes par
          l’admin).
        </p>
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
                  <span>
                    {c.nom}
                    <span className="promo-qui"> · {c.pourcentage_interessement ?? 0} %</span>
                  </span>
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
            <span className="recap-label">CA du jour{afficherDeclare ? ' (déclaré)' : ''}</span>
            <span className="recap-valeur">{formatEuros(caAffiche)}</span>
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
            {tauxParDefaut > 0 &&
              ` (${tauxParDefaut} %${nbInteresses > 1 ? ` · CA ÷ ${nbInteresses}` : ''})`}
          </span>
          <strong>{formatEuros(intAffiche)}</strong>
        </div>
      </div>
        </div>
      </div>
    </div>
  );
}
