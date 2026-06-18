import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { formatEuros, formatDateFr } from '../lib/format';
import { somme } from '../lib/comptabilite';
import { analyserFichiers } from '../lib/importHistorique';

// Outil admin — Import de l'historique : on dépose un ou plusieurs CSV exportés
// du tableur, l'app classe automatiquement caisse / charges / fournisseurs.
export default function Import() {
  const { utilisateur } = useAuth();
  const [employes, setEmployes] = useState([]);
  const [employeId, setEmployeId] = useState(utilisateur.id);
  const [resultat, setResultat] = useState(null);
  const [statut, setStatut] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    supabase.from('users').select('id, nom').order('nom').then(({ data }) => setEmployes(data ?? []));
  }, []);

  async function choisirFichiers(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (files.length === 0) return;
    setStatut('');
    const fichiers = await Promise.all(
      files.map(async (f) => ({ nom: f.name, texte: await f.text() })),
    );
    setResultat(analyserFichiers(fichiers));
  }

  async function importer() {
    if (!resultat) return;
    setEnCours(true);
    setStatut('');
    const erreurs = [];

    if (resultat.caisse.length) {
      const rows = resultat.caisse.map((c) => ({
        employe_id: employeId,
        date: c.date,
        ventes_directes: c.ventes_directes,
        cb: c.cb,
        especes: c.especes,
      }));
      const { error } = await supabase.from('caisse_jour').upsert(rows, { onConflict: 'employe_id,date' });
      if (error) erreurs.push(`Caisse : ${error.message}`);
    }
    if (resultat.charges.length) {
      const { error } = await supabase.from('charges').insert(resultat.charges);
      if (error) erreurs.push(`Charges : ${error.message}`);
    }
    if (resultat.fournisseurs.length) {
      const { error } = await supabase.from('fournisseurs').insert(resultat.fournisseurs);
      if (error) erreurs.push(`Fournisseurs : ${error.message}`);
    }

    setEnCours(false);
    if (erreurs.length) {
      setStatut(`Erreur — ${erreurs.join(' · ')}`);
      return;
    }
    setStatut(
      `Import réussi : ${resultat.caisse.length} journée(s), ${resultat.charges.length} charge(s), ${resultat.fournisseurs.length} fournisseur(s).`,
    );
    setResultat(null);
  }

  const totalCaisse = resultat ? somme(resultat.caisse.map((c) => c.ventes_directes)) : 0;
  const totalCharges = resultat ? somme(resultat.charges.map((c) => c.montant)) : 0;
  const totalFourn = resultat ? somme(resultat.fournisseurs.map((c) => c.montant)) : 0;

  return (
    <div className="page">
      <h1>Import de l'historique</h1>

      <div className="card">
        <p className="statut">
          Dépose <strong>un ou plusieurs fichiers CSV</strong> exportés de ton tableur
          (Revenus, Dépenses, Fournisseurs…). L'app reconnaît automatiquement chaque tableau et
          range les données. Les tableaux de synthèse (CA semaine, bénéfices, totaux…) sont ignorés.
        </p>
        <label className="field">
          <span>Attribuer les journées de caisse à l'employé</span>
          <select value={employeId} onChange={(e) => setEmployeId(e.target.value)}>
            {employes.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.nom}</option>
            ))}
          </select>
        </label>
        <label className="btn btn-primary">
          Choisir les fichiers CSV…
          <input
            type="file"
            accept=".csv,text/csv"
            multiple
            style={{ display: 'none' }}
            onChange={choisirFichiers}
          />
        </label>
      </div>

      {resultat && (
        <>
          <div className="cartes-kpi">
            <div className="kpi">
              <span className="kpi-label">Journées de caisse</span>
              <span className="kpi-valeur">{resultat.caisse.length}</span>
              <span className="statut">{formatEuros(totalCaisse)} de CA</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Charges</span>
              <span className="kpi-valeur">{resultat.charges.length}</span>
              <span className="statut">{formatEuros(totalCharges)}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Fournisseurs</span>
              <span className="kpi-valeur">{resultat.fournisseurs.length}</span>
              <span className="statut">{formatEuros(totalFourn)}</span>
            </div>
          </div>

          {resultat.caisse.length > 0 && (
            <div className="card">
              <h2>Aperçu caisse</h2>
              <table className="tableau">
                <thead>
                  <tr><th>Date</th><th className="droite">CA</th><th className="droite">CB</th><th className="droite">Espèces</th></tr>
                </thead>
                <tbody>
                  {resultat.caisse.slice(0, 8).map((c, i) => (
                    <tr key={i}>
                      <td>{formatDateFr(c.date)}</td>
                      <td className="droite">{formatEuros(c.ventes_directes)}</td>
                      <td className="droite">{formatEuros(c.cb)}</td>
                      <td className="droite">{formatEuros(c.especes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {resultat.caisse.length > 8 && (
                <p className="statut">… et {resultat.caisse.length - 8} autre(s) journée(s).</p>
              )}
            </div>
          )}

          {resultat.ignores.length > 0 && (
            <p className="statut">Fichiers ignorés (synthèses) : {resultat.ignores.join(', ')}.</p>
          )}

          <button className="btn btn-primary" onClick={importer} disabled={enCours}>
            {enCours ? 'Import…' : 'Importer dans l’application'}
          </button>
        </>
      )}

      {statut && <p className="statut">{statut}</p>}

      <div className="card">
        <p className="statut">
          La caisse est importée par <strong>upsert</strong> (employé + date) : ré-importer met à
          jour sans créer de doublon. Charges et fournisseurs sont ajoutés (le mois vient du nom du
          fichier, ex. « Mars 2026-Dépenses.csv »). Attention à ne pas importer deux fois les mêmes
          dépenses.
        </p>
      </div>
    </div>
  );
}
