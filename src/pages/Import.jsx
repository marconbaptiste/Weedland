import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { formatEuros, formatDateFr, formatNombre } from '../lib/format';
import { somme } from '../lib/comptabilite';
import { cleEntete } from '../lib/csv';
import { analyserFichiers, analyserChromes, analyserStocks } from '../lib/importHistorique';

const UNITES = ['g', 'kg', 'mg', 'ml', 'pièce'];

// Outil admin — Import de l'historique.
// - Tableur : dépose les CSV exportés (caisse/charges/fournisseurs), dispatch auto.
// - Chromes : un CSV détaillé de dettes clients (rattaché par surnom, sans doublon).
export default function Import() {
  const { utilisateur } = useAuth();
  const [mode, setMode] = useState('tableur');
  const [employes, setEmployes] = useState([]);
  const [employeId, setEmployeId] = useState(utilisateur.id);
  const [resultat, setResultat] = useState(null);
  const [chromes, setChromes] = useState(null);
  const [remplacer, setRemplacer] = useState(false);
  const [statut, setStatut] = useState('');
  const [enCours, setEnCours] = useState(false);
  // Import stocks (CSV catégorie / produit / quantité)
  const [stocks, setStocks] = useState(null);
  const [catForcee, setCatForcee] = useState('');
  const [uniteDefaut, setUniteDefaut] = useState('g');
  const [ajouterQte, setAjouterQte] = useState(true);

  useEffect(() => {
    supabase.from('users').select('id, nom').order('nom').then(({ data }) => setEmployes(data ?? []));
  }, []);

  // ----- Tableur (caisse / charges / fournisseurs) -----
  async function choisirFichiers(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (files.length === 0) return;
    setStatut('');
    const fichiers = await Promise.all(files.map(async (f) => ({ nom: f.name, texte: await f.text() })));
    setResultat(analyserFichiers(fichiers));
  }

  async function importerTableur() {
    if (!resultat) return;
    setEnCours(true);
    setStatut('');
    const erreurs = [];
    if (resultat.caisse.length) {
      const rows = resultat.caisse.map((c) => ({
        employe_id: employeId, date: c.date, ventes_directes: c.ventes_directes, cb: c.cb, especes: c.especes,
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
    if (erreurs.length) { setStatut(`Erreur — ${erreurs.join(' · ')}`); return; }
    setStatut(`Import réussi : ${resultat.caisse.length} journée(s), ${resultat.charges.length} charge(s), ${resultat.fournisseurs.length} fournisseur(s).`);
    setResultat(null);
  }

  // ----- Chromes (dettes clients) -----
  async function choisirChromes(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStatut('');
    setChromes(analyserChromes(await file.text()));
  }

  async function importerChromes() {
    if (!chromes || chromes.length === 0) return;
    setEnCours(true);
    setStatut('');

    if (remplacer) {
      const { error } = await supabase.from('chromes').delete().not('id', 'is', null);
      if (error) { setEnCours(false); setStatut(`Erreur suppression : ${error.message}`); return; }
    }

    // Rattachement des clients par surnom (réutilise l'existant, crée les manquants).
    const { data: clients } = await supabase.from('clients').select('id, surnom');
    const map = new Map((clients ?? []).map((c) => [cleEntete(c.surnom), c.id]));
    const manquants = [...new Set(chromes.map((l) => l.surnom))].filter((s) => !map.has(cleEntete(s)));
    if (manquants.length) {
      const { data: crees, error } = await supabase.from('clients').insert(manquants.map((surnom) => ({ surnom }))).select('id, surnom');
      if (error) { setEnCours(false); setStatut(`Erreur création clients : ${error.message}`); return; }
      (crees ?? []).forEach((c) => map.set(cleEntete(c.surnom), c.id));
    }

    const rows = chromes.map((l) => ({
      client_id: map.get(cleEntete(l.surnom)), type: l.type, montant: l.montant, date: l.date, employe_id: utilisateur.id,
    }));
    const { error } = await supabase.from('chromes').insert(rows);
    setEnCours(false);
    if (error) { setStatut(`Erreur : ${error.message}`); return; }
    setStatut(`${rows.length} ligne(s) de chromes importée(s) pour ${manquants.length} nouveau(x) client(s).`);
    setChromes(null);
  }

  // ----- Stocks (catégorie / produit / quantité) -----
  async function choisirStocks(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStatut('');
    setStocks(analyserStocks(await file.text()));
  }

  async function importerStocks() {
    if (!stocks || stocks.length === 0) return;
    setEnCours(true);
    setStatut('');
    // Rapproche par nom (insensible casse/accents) : réappro si existant, sinon création.
    const { data: existants } = await supabase.from('stocks').select('id, nom, quantite');
    const map = new Map((existants ?? []).map((s) => [cleEntete(s.nom), s]));
    const cat = catForcee.trim();
    const aInserer = [];
    const aMaj = [];
    for (const l of stocks) {
      const ex = map.get(cleEntete(l.nom));
      if (ex) {
        const q = ajouterQte ? Number(ex.quantite) + l.quantite : l.quantite;
        aMaj.push({ id: ex.id, quantite: q });
      } else {
        aInserer.push({
          categorie: cat || l.categorie || null,
          nom: l.nom,
          quantite: l.quantite,
          unite: uniteDefaut,
          seuil_alerte: 0,
          prix_achat: 0,
          prix_vente: 0,
        });
      }
    }
    const erreurs = [];
    if (aInserer.length) {
      const { error } = await supabase.from('stocks').insert(aInserer);
      if (error) erreurs.push(error.message);
    }
    for (const u of aMaj) {
      const { error } = await supabase.from('stocks').update({ quantite: u.quantite }).eq('id', u.id);
      if (error) { erreurs.push(error.message); break; }
    }
    setEnCours(false);
    if (erreurs.length) { setStatut(`Erreur — ${erreurs.join(' · ')}`); return; }
    setStatut(`Import stocks : ${aInserer.length} nouveau(x) produit(s), ${aMaj.length} réapprovisionné(s).`);
    setStocks(null);
  }

  const totalCaisse = resultat ? somme(resultat.caisse.map((c) => c.ventes_directes)) : 0;
  const totalCharges = resultat ? somme(resultat.charges.map((c) => c.montant)) : 0;
  const totalFourn = resultat ? somme(resultat.fournisseurs.map((c) => c.montant)) : 0;
  const detteNette = chromes
    ? somme(chromes.map((l) => (l.type === 'avance' ? l.montant : -l.montant)))
    : 0;
  const nbClientsChromes = chromes ? new Set(chromes.map((l) => l.surnom)).size : 0;

  return (
    <div className="page">
      <h1>Import de l'historique</h1>

      <div className="bascule">
        <button className={mode === 'tableur' ? 'actif' : ''} onClick={() => setMode('tableur')}>Tableur (caisse/charges/fournisseurs)</button>
        <button className={mode === 'chromes' ? 'actif' : ''} onClick={() => setMode('chromes')}>Dettes clients</button>
        <button className={mode === 'stocks' ? 'actif' : ''} onClick={() => setMode('stocks')}>Stocks</button>
      </div>

      {mode === 'tableur' ? (
        <>
          <div className="card">
            <p className="statut">
              Dépose <strong>un ou plusieurs CSV</strong> exportés de ton tableur. L'app reconnaît
              chaque tableau (caisse, charges, fournisseurs) et ignore les synthèses.
            </p>
            <label className="field">
              <span>Attribuer les journées de caisse à l'employé</span>
              <select value={employeId} onChange={(e) => setEmployeId(e.target.value)}>
                {employes.map((emp) => (<option key={emp.id} value={emp.id}>{emp.nom}</option>))}
              </select>
            </label>
            <label className="btn btn-primary">
              Choisir les fichiers CSV…
              <input type="file" accept=".csv,text/csv" multiple style={{ display: 'none' }} onChange={choisirFichiers} />
            </label>
          </div>

          {resultat && (
            <>
              <div className="cartes-kpi">
                <div className="kpi"><span className="kpi-label">Journées</span><span className="kpi-valeur">{resultat.caisse.length}</span><span className="statut">{formatEuros(totalCaisse)}</span></div>
                <div className="kpi"><span className="kpi-label">Charges</span><span className="kpi-valeur">{resultat.charges.length}</span><span className="statut">{formatEuros(totalCharges)}</span></div>
                <div className="kpi"><span className="kpi-label">Fournisseurs</span><span className="kpi-valeur">{resultat.fournisseurs.length}</span><span className="statut">{formatEuros(totalFourn)}</span></div>
              </div>
              {resultat.ignores.length > 0 && <p className="statut">Ignorés : {resultat.ignores.join(', ')}.</p>}
              <button className="btn btn-primary" onClick={importerTableur} disabled={enCours}>
                {enCours ? 'Import…' : 'Importer dans l’application'}
              </button>
            </>
          )}
        </>
      ) : mode === 'chromes' ? (
        <>
          <div className="card">
            <p className="statut">
              Dépose un <strong>CSV de chromes</strong> (colonnes : date, client, type, montant_eur).
              Les clients sont rattachés <strong>par surnom</strong> (pas de doublon de fiche).
            </p>
            <label className="case-partage">
              <input type="checkbox" checked={remplacer} onChange={(e) => setRemplacer(e.target.checked)} />
              <span>Repartir de zéro (supprime d'abord tous les chromes existants — utile si tu remplaces un total provisoire)</span>
            </label>
            <label className="btn btn-primary">
              Choisir le fichier CSV…
              <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={choisirChromes} />
            </label>
          </div>

          {chromes && (
            <>
              <div className="cartes-kpi">
                <div className="kpi"><span className="kpi-label">Lignes</span><span className="kpi-valeur">{chromes.length}</span></div>
                <div className="kpi"><span className="kpi-label">Clients</span><span className="kpi-valeur">{nbClientsChromes}</span></div>
                <div className="kpi"><span className="kpi-label">Dette nette</span><span className="kpi-valeur">{formatEuros(detteNette)}</span></div>
              </div>
              <div className="card">
                <h2>Aperçu</h2>
                <table className="tableau">
                  <thead><tr><th>Date</th><th>Client</th><th>Type</th><th className="droite">Montant</th></tr></thead>
                  <tbody>
                    {chromes.slice(0, 12).map((l, i) => (
                      <tr key={i}>
                        <td>{formatDateFr(l.date)}</td>
                        <td>{l.surnom}</td>
                        <td>{l.type === 'avance' ? 'Avance' : 'Remboursement'}</td>
                        <td className={`droite ${l.type === 'avance' ? 'dette' : 'solde-ok'}`}>{formatEuros(l.montant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {chromes.length > 12 && <p className="statut">… et {chromes.length - 12} autre(s) ligne(s).</p>}
              </div>
              <button className="btn btn-primary" onClick={importerChromes} disabled={enCours}>
                {enCours ? 'Import…' : `Importer ${chromes.length} ligne(s)`}
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <div className="card">
            <p className="statut">
              Dépose un <strong>CSV de stocks</strong> — colonnes reconnues : <strong>catégorie</strong>,{' '}
              <strong>produit</strong>, <strong>quantité</strong> (peu importe l'ordre / la casse).
              Produit déjà présent = réapprovisionné ; sinon créé.
            </p>
            <div className="form-inline">
              <label className="field" style={{ flex: 1 }}>
                <span>Catégorie à forcer (facultatif — sinon celle du fichier)</span>
                <input
                  value={catForcee}
                  onChange={(e) => setCatForcee(e.target.value)}
                  placeholder="ex. Fleurs"
                />
              </label>
              <label className="field">
                <span>Unité (nouveaux produits)</span>
                <select value={uniteDefaut} onChange={(e) => setUniteDefaut(e.target.value)}>
                  {UNITES.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="case-partage">
              <input type="checkbox" checked={ajouterQte} onChange={(e) => setAjouterQte(e.target.checked)} />
              <span>Ajouter aux quantités existantes (réappro). Décoché = remplace la quantité.</span>
            </label>
            <label className="btn btn-primary">
              Choisir le fichier CSV…
              <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={choisirStocks} />
            </label>
          </div>

          {stocks && (
            <>
              <div className="cartes-kpi">
                <div className="kpi"><span className="kpi-label">Lignes</span><span className="kpi-valeur">{stocks.length}</span></div>
                <div className="kpi"><span className="kpi-label">Quantité totale</span><span className="kpi-valeur">{formatNombre(somme(stocks.map((s) => s.quantite)))}</span></div>
              </div>
              <div className="card">
                <h2>Aperçu</h2>
                <table className="tableau">
                  <thead><tr><th>Catégorie</th><th>Produit</th><th className="droite">Quantité</th></tr></thead>
                  <tbody>
                    {stocks.slice(0, 12).map((s, i) => (
                      <tr key={i}>
                        <td>{catForcee.trim() || s.categorie || '—'}</td>
                        <td>{s.nom}</td>
                        <td className="droite">{formatNombre(s.quantite)} {uniteDefaut}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stocks.length > 12 && <p className="statut">… et {stocks.length - 12} autre(s) ligne(s).</p>}
              </div>
              <button className="btn btn-primary" onClick={importerStocks} disabled={enCours}>
                {enCours ? 'Import…' : `Importer ${stocks.length} produit(s)`}
              </button>
            </>
          )}
        </>
      )}

      {statut && <p className="statut">{statut}</p>}
    </div>
  );
}
