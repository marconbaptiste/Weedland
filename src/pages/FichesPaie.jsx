import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { parseMontant, formatEuros, formatNombre } from '../lib/format';
import { premierDuMois, intervallePeriode } from '../lib/dates';
import { somme } from '../lib/comptabilite';
import { calculerBulletin, bulletinVierge } from '../lib/bulletin';
import { telechargerBulletinPaie } from '../lib/export';
import { lireBrouillon, ecrireBrouillon, effacerBrouillon } from '../lib/brouillon';

const labelMois = (m) =>
  new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(
    new Date(`${m}T00:00:00`),
  );

// Outil admin — Éditeur de bulletins de paie (enregistrés par employé/mois).
export default function FichesPaie() {
  const [employes, setEmployes] = useState([]);
  const [employeId, setEmployeId] = useState('');
  const [mois, setMois] = useState(premierDuMois());
  const [employeur, setEmployeur] = useState({});
  const [fiche, setFiche] = useState(bulletinVierge());
  const [ficheId, setFicheId] = useState(null);
  const [statut, setStatut] = useState('');
  const [activite, setActivite] = useState({ interessement: 0, heures: 0, jours: 0 });

  // Brouillon (survit au changement d'onglet) du bulletin en cours d'édition.
  const cleBrouillon = `brouillon-fiche:${employeId}:${mois}`;
  const pret = useRef(false);

  // Chargement initial : employés + infos employeur mémorisées.
  useEffect(() => {
    supabase.from('users').select('id, nom').order('nom').then(({ data }) => setEmployes(data ?? []));
    supabase
      .from('parametres')
      .select('valeur')
      .eq('cle', 'employeur')
      .maybeSingle()
      .then(({ data }) => setEmployeur(data?.valeur ?? {}));
  }, []);

  // Chargement du bulletin pour (employé, mois).
  const charger = useCallback(async () => {
    if (!employeId) return;
    setStatut('');
    pret.current = false;
    const cle = `brouillon-fiche:${employeId}:${mois}`;
    const { data } = await supabase
      .from('fiches_paie')
      .select('id, data')
      .eq('employe_id', employeId)
      .eq('mois', mois)
      .maybeSingle();
    const [dM, fM] = intervallePeriode('mois', mois);
    const periodeDefaut = { date_paiement: '', debut: dM, fin: fM, heures: '', jours: '' };
    setFicheId(data?.id ?? null);

    const brouillon = lireBrouillon(cle);
    if (brouillon) {
      setFiche(brouillon);
    } else if (data) {
      const d = { ...bulletinVierge(), ...data.data };
      d.periode = { ...periodeDefaut, ...(data.data.periode || {}) };
      setFiche(d);
    } else {
      const vierge = bulletinVierge();
      vierge.salarie.nom = employes.find((e) => e.id === employeId)?.nom ?? '';
      vierge.periode = periodeDefaut;
      setFiche(vierge);
    }
    pret.current = true;
  }, [employeId, mois, employes]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Sauvegarde le brouillon à chaque modification (après chargement).
  useEffect(() => {
    if (!pret.current || !employeId) return;
    ecrireBrouillon(cleBrouillon, fiche);
  }, [fiche, employeId, cleBrouillon]);

  // Active = intéressement + heures + jours de l'employé sur la période choisie
  // (inclut clôtures et journées partagées, via v_interessement_employe).
  const debut = fiche.periode?.debut;
  const fin = fiche.periode?.fin;
  useEffect(() => {
    if (!employeId || !debut || !fin) return;
    let actif = true;
    supabase
      .from('v_interessement_employe')
      .select('date, interessement, heures_travaillees')
      .eq('employe_id', employeId)
      .gte('date', debut)
      .lte('date', fin)
      .then(({ data }) => {
        if (!actif) return;
        const rows = data ?? [];
        setActivite({
          interessement: somme(rows.map((r) => r.interessement)),
          heures: somme(rows.map((r) => r.heures_travaillees)),
          jours: new Set(rows.map((r) => r.date)).size,
        });
      });
    return () => {
      actif = false;
    };
  }, [employeId, debut, fin]);

  // Reprend l'intéressement (ligne de gain) + les heures/jours de la période.
  function reprendreActivite() {
    setFiche((f) => {
      const gains = [...f.gains];
      const idx = gains.findIndex((g) => (g.libelle || '').toLowerCase().includes('intéress'));
      const ligne = { libelle: 'Intéressement', montant: String(activite.interessement) };
      if (idx >= 0) gains[idx] = ligne;
      else gains.push(ligne);
      return {
        ...f,
        gains,
        periode: {
          ...f.periode,
          heures: String(activite.heures),
          jours: String(activite.jours),
        },
      };
    });
    setStatut('Intéressement et activité repris dans le bulletin.');
  }

  // --- Mises à jour ---
  const majSalarie = (champ, v) =>
    setFiche((f) => ({ ...f, salarie: { ...f.salarie, [champ]: v } }));
  const majConges = (champ, v) =>
    setFiche((f) => ({ ...f, conges: { ...f.conges, [champ]: v } }));
  const majChamp = (champ, v) => setFiche((f) => ({ ...f, [champ]: v }));
  const majPeriode = (champ, v) =>
    setFiche((f) => ({ ...f, periode: { ...f.periode, [champ]: v } }));

  const majGain = (i, champ, v) =>
    setFiche((f) => ({
      ...f,
      gains: f.gains.map((g, j) => (j === i ? { ...g, [champ]: v } : g)),
    }));
  const ajouterGain = () =>
    setFiche((f) => ({ ...f, gains: [...f.gains, { libelle: '', montant: '' }] }));
  const supprimerGain = (i) =>
    setFiche((f) => ({ ...f, gains: f.gains.filter((_, j) => j !== i) }));

  const majCot = (i, champ, v) =>
    setFiche((f) => ({
      ...f,
      cotisations: f.cotisations.map((c, j) => (j === i ? { ...c, [champ]: v } : c)),
    }));
  const ajouterCot = () =>
    setFiche((f) => ({
      ...f,
      cotisations: [...f.cotisations, { libelle: '', base: '', taux_sal: '', taux_pat: '' }],
    }));
  const supprimerCot = (i) =>
    setFiche((f) => ({ ...f, cotisations: f.cotisations.filter((_, j) => j !== i) }));

  // --- Calculs ---
  const gainsNum = fiche.gains.map((g) => ({ ...g, montant: parseMontant(g.montant) }));
  const cotsNum = fiche.cotisations.map((c) => ({
    ...c,
    base: parseMontant(c.base),
    taux_sal: parseMontant(c.taux_sal),
    taux_pat: parseMontant(c.taux_pat),
  }));
  const totaux = calculerBulletin({
    gains: gainsNum,
    cotisations: cotsNum,
    netImposable: fiche.net_imposable === '' ? undefined : parseMontant(fiche.net_imposable),
    tauxPas: parseMontant(fiche.taux_pas),
  });

  // --- Enregistrement ---
  async function enregistrerEmployeur() {
    await supabase
      .from('parametres')
      .upsert({ cle: 'employeur', valeur: employeur, updated_at: new Date().toISOString() }, { onConflict: 'cle' });
    setStatut('Employeur enregistré ✅');
  }

  async function enregistrerFiche() {
    if (!employeId) return;
    const { data, error } = await supabase
      .from('fiches_paie')
      .upsert(
        { employe_id: employeId, mois, data: fiche, updated_at: new Date().toISOString() },
        { onConflict: 'employe_id,mois' },
      )
      .select()
      .single();
    if (!error && data) {
      setFicheId(data.id);
      effacerBrouillon(cleBrouillon);
      setStatut('Bulletin enregistré ✅');
    } else {
      setStatut('Erreur lors de l’enregistrement.');
    }
  }

  function exporterPDF() {
    const nom = fiche.salarie.nom || employes.find((e) => e.id === employeId)?.nom || 'salarie';
    telechargerBulletinPaie(`bulletin-${nom}-${mois.slice(0, 7)}.pdf`, {
      employeur,
      salarie: fiche.salarie,
      periodeLabel: labelMois(mois),
      datePaiement: fiche.periode?.date_paiement,
      heures: fiche.periode?.heures,
      jours: fiche.periode?.jours,
      gains: gainsNum,
      cotisations: totaux.lignes,
      totaux,
      tauxPas: parseMontant(fiche.taux_pas),
      conges: fiche.conges,
    });
  }

  return (
    <div className="page">
      <h1>Fiches de paie</h1>

      <details className="card">
        <summary><strong>Informations employeur</strong> (mémorisées)</summary>
        <div className="bloc-form">
          {[
            ['raison_sociale', 'Raison sociale'],
            ['adresse', 'Adresse'],
            ['siret', 'SIRET'],
            ['code_ape', 'Code APE / NAF'],
            ['convention', 'Convention collective'],
          ].map(([champ, libelle]) => (
            <label className="field" key={champ}>
              <span>{libelle}</span>
              <input
                value={employeur[champ] ?? ''}
                onChange={(e) => setEmployeur((x) => ({ ...x, [champ]: e.target.value }))}
              />
            </label>
          ))}
          <button className="btn" onClick={enregistrerEmployeur}>
            Enregistrer l’employeur
          </button>
        </div>
      </details>

      <div className="card filtres">
        <label className="field">
          <span>Employé</span>
          <select value={employeId} onChange={(e) => setEmployeId(e.target.value)}>
            <option value="">— Choisir —</option>
            {employes.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Mois</span>
          <input type="month" value={mois.slice(0, 7)} onChange={(e) => setMois(`${e.target.value}-01`)} />
        </label>
        <p className="periode-info">{labelMois(mois)}{ficheId ? ' · enregistré' : ' · nouveau'}</p>
      </div>

      {!employeId ? (
        <p className="vide">Sélectionnez un employé pour éditer son bulletin.</p>
      ) : (
        <>
          <div className="card">
            <h2>Salarié</h2>
            <div className="bloc-form">
              {[
                ['nom', 'Nom'],
                ['emploi', 'Emploi / poste'],
                ['statut', 'Statut'],
                ['num_secu', 'N° de sécurité sociale'],
                ['date_entree', 'Date d’entrée'],
              ].map(([champ, libelle]) => (
                <label className="field" key={champ}>
                  <span>{libelle}</span>
                  <input value={fiche.salarie[champ] ?? ''} onChange={(e) => majSalarie(champ, e.target.value)} />
                </label>
              ))}
              <label className="field">
                <span>Période du</span>
                <input
                  type="date"
                  value={fiche.periode?.debut ?? ''}
                  onChange={(e) => majPeriode('debut', e.target.value)}
                />
              </label>
              <label className="field">
                <span>au</span>
                <input
                  type="date"
                  value={fiche.periode?.fin ?? ''}
                  onChange={(e) => majPeriode('fin', e.target.value)}
                />
              </label>
              <label className="field">
                <span>Date de paiement</span>
                <input
                  type="date"
                  value={fiche.periode?.date_paiement ?? ''}
                  onChange={(e) => majPeriode('date_paiement', e.target.value)}
                />
              </label>
              <label className="field">
                <span>Heures travaillées</span>
                <input
                  inputMode="decimal"
                  value={fiche.periode?.heures ?? ''}
                  onChange={(e) => majPeriode('heures', e.target.value)}
                />
              </label>
              <label className="field">
                <span>Jours travaillés</span>
                <input
                  inputMode="decimal"
                  value={fiche.periode?.jours ?? ''}
                  onChange={(e) => majPeriode('jours', e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="card">
            <h2>Activité sur la période</h2>
            <div className="recap-ligne">
              <span>Intéressement</span>
              <strong>{formatEuros(activite.interessement)}</strong>
            </div>
            <div className="recap-ligne">
              <span>Heures</span>
              <strong>{formatNombre(activite.heures)} h</strong>
            </div>
            <div className="recap-ligne">
              <span>Jours travaillés</span>
              <strong>{activite.jours}</strong>
            </div>
            <button className="btn btn-primary" onClick={reprendreActivite}>
              Reprendre dans le bulletin
            </button>
            <p className="statut">
              Reprend l’intéressement en ligne de gain et renseigne les heures/jours, calculés
              sur la période (clôtures + journées partagées).
            </p>
          </div>

          <div className="card">
            <div className="entete-client">
              <h2>Rémunération (gains)</h2>
              <strong>{formatEuros(totaux.brut)}</strong>
            </div>
            <table className="tableau">
              <tbody>
                {fiche.gains.map((g, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        className="champ-nom"
                        placeholder="Libellé"
                        value={g.libelle}
                        onChange={(e) => majGain(i, 'libelle', e.target.value)}
                      />
                    </td>
                    <td className="droite">
                      <input
                        className="champ-pourcentage"
                        inputMode="decimal"
                        placeholder="0"
                        value={g.montant}
                        onChange={(e) => majGain(i, 'montant', e.target.value)}
                      />
                    </td>
                    <td>
                      <button className="btn btn-discret" onClick={() => supprimerGain(i)} aria-label="Supprimer">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn" onClick={ajouterGain}>+ Ligne de gain</button>
          </div>

          <div className="card">
            <div className="entete-client">
              <h2>Cotisations</h2>
              <span className="periode-info">
                Salarié {formatEuros(totaux.totalSal)} · Employeur {formatEuros(totaux.totalPat)}
              </span>
            </div>
            <table className="tableau tableau-cot">
              <thead>
                <tr>
                  <th>Cotisation</th>
                  <th className="droite">Base</th>
                  <th className="droite">% sal.</th>
                  <th className="droite">Part sal.</th>
                  <th className="droite">% pat.</th>
                  <th className="droite">Part pat.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {fiche.cotisations.map((c, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        className="champ-nom"
                        value={c.libelle}
                        onChange={(e) => majCot(i, 'libelle', e.target.value)}
                      />
                    </td>
                    <td className="droite">
                      <input className="champ-mini" inputMode="decimal" value={c.base} onChange={(e) => majCot(i, 'base', e.target.value)} />
                    </td>
                    <td className="droite">
                      <input className="champ-mini" inputMode="decimal" value={c.taux_sal} onChange={(e) => majCot(i, 'taux_sal', e.target.value)} />
                    </td>
                    <td className="droite">{formatEuros(totaux.lignes[i]?.montant_sal ?? 0)}</td>
                    <td className="droite">
                      <input className="champ-mini" inputMode="decimal" value={c.taux_pat} onChange={(e) => majCot(i, 'taux_pat', e.target.value)} />
                    </td>
                    <td className="droite">{formatEuros(totaux.lignes[i]?.montant_pat ?? 0)}</td>
                    <td>
                      <button className="btn btn-discret" onClick={() => supprimerCot(i)} aria-label="Supprimer">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn" onClick={ajouterCot}>+ Cotisation</button>
          </div>

          <div className="card">
            <h2>Net & impôt</h2>
            <div className="bloc-form">
              <label className="field">
                <span>Net imposable (laisser vide = auto)</span>
                <input inputMode="decimal" placeholder={formatEuros(totaux.netAvantImpot)} value={fiche.net_imposable} onChange={(e) => majChamp('net_imposable', e.target.value)} />
              </label>
              <label className="field">
                <span>Taux prélèvement à la source (%)</span>
                <input inputMode="decimal" placeholder="0" value={fiche.taux_pas} onChange={(e) => majChamp('taux_pas', e.target.value)} />
              </label>
            </div>
          </div>

          <div className="card">
            <h2>Congés payés</h2>
            <div className="bloc-form">
              {[['acquis', 'Acquis'], ['pris', 'Pris'], ['solde', 'Solde']].map(([champ, libelle]) => (
                <label className="field" key={champ}>
                  <span>{libelle}</span>
                  <input inputMode="decimal" value={fiche.conges[champ] ?? ''} onChange={(e) => majConges(champ, e.target.value)} />
                </label>
              ))}
            </div>
          </div>

          <div className="card recap">
            <h2>Récapitulatif</h2>
            <div className="recap-ligne"><span>Salaire brut</span><strong>{formatEuros(totaux.brut)}</strong></div>
            <div className="recap-ligne"><span>− Cotisations salariales</span><strong>{formatEuros(totaux.totalSal)}</strong></div>
            <div className="recap-ligne"><span>Net avant impôt</span><strong>{formatEuros(totaux.netAvantImpot)}</strong></div>
            <div className="recap-ligne"><span>Net imposable</span><strong>{formatEuros(totaux.netImposable)}</strong></div>
            <div className="recap-ligne"><span>− Prélèvement à la source</span><strong>{formatEuros(totaux.pas)}</strong></div>
            <hr />
            <div className="recap-ligne"><span>Net à payer</span><strong className="solde-ok">{formatEuros(totaux.netPaye)}</strong></div>
            <div className="recap-ligne"><span>Coût total employeur</span><strong>{formatEuros(totaux.coutEmployeur)}</strong></div>
          </div>

          <div className="card">
            <div className="form-inline">
              <button className="btn btn-primary" onClick={enregistrerFiche}>Enregistrer le bulletin</button>
              <button className="btn" onClick={exporterPDF}>Export PDF</button>
            </div>
            {statut && <p className="statut">{statut}</p>}
            <p className="statut">
              Document indicatif établi sous la responsabilité de l’employeur. Faites valider les taux par votre comptable.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
