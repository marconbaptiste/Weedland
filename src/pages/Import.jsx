import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { parseMontant, formatEuros, formatDateFr } from '../lib/format';
import { normaliserDateISO, normaliserMoisISO } from '../lib/dates';
import { parseCSVObjets } from '../lib/csv';
import { telechargerCSV } from '../lib/export';

// Outil admin — Import de l'historique (CSV) : caisse, charges, fournisseurs.
const TYPES = {
  caisse: {
    libelle: 'Caisse journalière',
    entetes: ['date', 'ventes_directes', 'cb', 'especes', 'fond_caisse', 'commentaire'],
    exemple: ['2026-01-15', '2872', '2047', '762', '70', ''],
  },
  charges: {
    libelle: 'Charges',
    entetes: ['mois', 'libelle', 'montant'],
    exemple: ['2026-01', 'Loyer', '1731'],
  },
  fournisseurs: {
    libelle: 'Fournisseurs',
    entetes: ['mois', 'libelle', 'montant'],
    exemple: ['2026-01', '420Lab', '18000'],
  },
};

export default function Import() {
  const { utilisateur } = useAuth();
  const [type, setType] = useState('caisse');
  const [employes, setEmployes] = useState([]);
  const [employeId, setEmployeId] = useState(utilisateur.id);
  const [lignes, setLignes] = useState([]); // lignes mappées + validées
  const [statut, setStatut] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    supabase.from('users').select('id, nom').order('nom').then(({ data }) => setEmployes(data ?? []));
  }, []);

  function telechargerModele() {
    const t = TYPES[type];
    telechargerCSV(`modele-${type}.csv`, t.entetes, [t.exemple]);
  }

  function mapLigne(obj) {
    if (type === 'caisse') {
      const date = normaliserDateISO(obj.date);
      return {
        valide: Boolean(date),
        date,
        ventes_directes: parseMontant(obj.ventes_directes ?? obj.ca ?? obj.ventes ?? '0'),
        cb: parseMontant(obj.cb ?? '0'),
        especes: parseMontant(obj.especes ?? obj.moro ?? '0'),
        fond_caisse: parseMontant(obj.fond_caisse ?? obj.fond ?? '0'),
        commentaire: (obj.commentaire ?? '').trim() || null,
      };
    }
    const mois = normaliserMoisISO(obj.mois ?? obj.date);
    return {
      valide: Boolean(mois),
      mois,
      libelle: (obj.libelle ?? obj.nom ?? '').trim(),
      montant: parseMontant(obj.montant ?? '0'),
    };
  }

  async function choisirFichier(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStatut('');
    const texte = await file.text();
    const objets = parseCSVObjets(texte);
    setLignes(objets.map(mapLigne));
  }

  const valides = lignes.filter((l) => l.valide);
  const invalides = lignes.length - valides.length;

  async function importer() {
    if (valides.length === 0) return;
    setEnCours(true);
    setStatut('');
    let error;
    if (type === 'caisse') {
      const rows = valides.map((l) => ({
        employe_id: employeId,
        date: l.date,
        ventes_directes: l.ventes_directes,
        cb: l.cb,
        especes: l.especes,
        fond_caisse: l.fond_caisse,
        commentaire: l.commentaire,
      }));
      ({ error } = await supabase.from('caisse_jour').upsert(rows, { onConflict: 'employe_id,date' }));
    } else {
      const rows = valides.map((l) => ({ mois: l.mois, libelle: l.libelle, montant: l.montant }));
      ({ error } = await supabase.from(type).insert(rows));
    }
    setEnCours(false);
    if (error) {
      setStatut(`Erreur : ${error.message}`);
      return;
    }
    setStatut(`${valides.length} ligne(s) importée(s) ✅`);
    setLignes([]);
  }

  return (
    <div className="page">
      <h1>Import de l'historique</h1>

      <div className="card">
        <div className="bascule">
          {Object.keys(TYPES).map((k) => (
            <button key={k} className={type === k ? 'actif' : ''} onClick={() => { setType(k); setLignes([]); setStatut(''); }}>
              {TYPES[k].libelle}
            </button>
          ))}
        </div>

        <p className="statut">
          1. Télécharge le modèle, remplis-le (ou colle ton export), enregistre en CSV.
          2. Dépose le fichier ci-dessous. 3. Vérifie l'aperçu puis importe.
          {type === 'caisse' && ' Dates acceptées : 2026-01-15 ou 15/01/2026.'}
          {type !== 'caisse' && ' Mois accepté : 2026-01 ou 01/2026.'}
        </p>

        <div className="form-inline">
          <button className="btn" onClick={telechargerModele}>Télécharger le modèle CSV</button>
          <label className="btn btn-primary">
            Choisir un fichier CSV
            <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={choisirFichier} />
          </label>
        </div>

        {type === 'caisse' && (
          <label className="field">
            <span>Attribuer ces journées à l'employé</span>
            <select value={employeId} onChange={(e) => setEmployeId(e.target.value)}>
              {employes.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.nom}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {lignes.length > 0 && (
        <div className="card">
          <h2>
            Aperçu — {valides.length} valide(s){invalides > 0 ? `, ${invalides} ignorée(s)` : ''}
          </h2>
          <table className="tableau">
            <thead>
              {type === 'caisse' ? (
                <tr><th>Date</th><th className="droite">Ventes</th><th className="droite">CB</th><th className="droite">Espèces</th><th></th></tr>
              ) : (
                <tr><th>Mois</th><th>Libellé</th><th className="droite">Montant</th><th></th></tr>
              )}
            </thead>
            <tbody>
              {lignes.slice(0, 30).map((l, i) => (
                <tr key={i} className={l.valide ? '' : 'dette'}>
                  {type === 'caisse' ? (
                    <>
                      <td>{l.date ? formatDateFr(l.date) : '— date invalide —'}</td>
                      <td className="droite">{formatEuros(l.ventes_directes)}</td>
                      <td className="droite">{formatEuros(l.cb)}</td>
                      <td className="droite">{formatEuros(l.especes)}</td>
                      <td>{l.valide ? '' : '⚠️'}</td>
                    </>
                  ) : (
                    <>
                      <td>{l.mois ? l.mois.slice(0, 7) : '— mois invalide —'}</td>
                      <td>{l.libelle}</td>
                      <td className="droite">{formatEuros(l.montant)}</td>
                      <td>{l.valide ? '' : '⚠️'}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {lignes.length > 30 && <p className="statut">… et {lignes.length - 30} autre(s) ligne(s).</p>}
          <button className="btn btn-primary" onClick={importer} disabled={enCours || valides.length === 0}>
            {enCours ? 'Import…' : `Importer ${valides.length} ligne(s)`}
          </button>
        </div>
      )}

      {statut && <p className="statut">{statut}</p>}

      <div className="card">
        <p className="statut">
          La caisse est importée par <strong>upsert</strong> (employé + date) : ré-importer le même
          jour le met à jour, sans doublon. Tu pourras affiner par employé plus tard en ré-important
          avec un autre employé sélectionné. Charges et fournisseurs sont ajoutés tels quels.
        </p>
      </div>
    </div>
  );
}
