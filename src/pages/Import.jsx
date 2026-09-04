import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { formatEuros, formatDateFr, formatNombre } from '../lib/format';
import { somme } from '../lib/comptabilite';
import { cleEntete } from '../lib/csv';
import { analyserFichiers, analyserChromes, analyserStocks } from '../lib/importHistorique';
import { journaliserMouvement } from '../lib/mouvementsStock';
import { telechargerCSV } from '../lib/export';

const UNITES = ['g', 'kg', 'mg', 'ml', 'pièce'];

// Modèles CSV téléchargeables : un exemple par type d'import, pour que
// l'utilisateur voie exactement le format attendu (colonnes + une ligne).
const MODELES = {
  caisse: {
    fichier: 'modele-caisse.csv',
    entetes: ['date', 'ca', 'cb', 'especes', 'virements'],
    exemple: ['2026-01-15', '250,00', '180,00', '70,00', '0'],
  },
  chromes: {
    fichier: 'modele-dettes-clients.csv',
    entetes: ['date', 'client', 'type', 'montant_eur'],
    exemple: ['2026-01-15', 'Le Grand', 'avance', '20,00'],
  },
  stocks: {
    fichier: 'modele-stocks.csv',
    entetes: ['categorie', 'produit', 'quantite'],
    exemple: ['Fleurs', 'Amnesia', '50'],
  },
};
const telechargerModele = (cle) => {
  const m = MODELES[cle];
  telechargerCSV(m.fichier, m.entetes, [m.exemple]);
};

// Outil admin — Import de l'historique.
// - Tableur : dépose les CSV exportés (caisse/charges/fournisseurs), dispatch auto.
// - Chromes : un CSV détaillé de dettes clients (rattaché par surnom, sans doublon).
export default function Import() {
  const { utilisateur, magasinId } = useAuth();
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
    if (!magasinId) return;
    // Cloisonné au magasin actif (évite d'affecter un import à un employé d'un
    // autre magasin quand c'est un superadmin qui importe).
    supabase.from('users').select('id, nom').eq('magasin_id', magasinId).order('nom').then(({ data }) => setEmployes(data ?? []));
  }, [magasinId]);

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
        employe_id: employeId, date: c.date, ventes_directes: c.ventes_directes, cb: c.cb, especes: c.especes, virements: c.virements ?? 0,
      }));
      const { error } = await supabase.from('caisse_jour').upsert(rows, { onConflict: 'employe_id,date' });
      if (error) { console.error('Import caisse:', error); erreurs.push('caisse'); }
    }
    if (resultat.charges.length) {
      const { error } = await supabase.from('charges').insert(resultat.charges);
      if (error) { console.error('Import charges:', error); erreurs.push('charges'); }
    }
    if (resultat.fournisseurs.length) {
      const { error } = await supabase.from('fournisseurs').insert(resultat.fournisseurs);
      if (error) { console.error('Import fournisseurs:', error); erreurs.push('fournisseurs'); }
    }
    setEnCours(false);
    if (erreurs.length) { setStatut(`Import impossible pour : ${erreurs.join(', ')}. Vérifie le fichier et réessaie.`); return; }
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
    if (
      remplacer &&
      !window.confirm(
        'ATTENTION : « Repartir de zéro » va SUPPRIMER TOUS les chromes (avances/dettes) existants avant l\'import. Cette action est irréversible. Continuer ?',
      )
    ) {
      return;
    }
    setEnCours(true);
    setStatut('');

    // Import TRANSACTIONNEL côté serveur (`importer_chromes`) : rattachement des
    // clients par surnom, purge éventuelle et insertion dans la même transaction.
    // Plus aucun cas où l'historique est supprimé puis l'insertion échoue.
    const { data, error } = await supabase.rpc('importer_chromes', {
      p_lignes: chromes.map((l) => ({ surnom: l.surnom, type: l.type, montant: l.montant, date: l.date })),
      p_remplacer: remplacer,
    });
    setEnCours(false);
    if (error) { console.error('Import chromes:', error); setStatut(`Import impossible (rien n'a été modifié) : ${error.message}`); return; }
    setStatut(`${data?.lignes ?? chromes.length} ligne(s) de chromes importée(s) pour ${data?.clients_crees ?? 0} nouveau(x) client(s).`);
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
        aMaj.push({ id: ex.id, nom: ex.nom, quantite: q, delta: q - Number(ex.quantite) });
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
      const { data: crees, error } = await supabase.from('stocks').insert(aInserer).select('id, nom, quantite');
      if (error) { console.error('Import stocks — création:', error); erreurs.push('création'); }
      // Trace chaque nouveau produit importé (mouvement d'entrée, motif import).
      for (const c of crees ?? []) {
        if (Number(c.quantite) > 0) {
          await journaliserMouvement({
            stock_id: c.id,
            produit: c.nom,
            delta: Number(c.quantite),
            quantite_apres: Number(c.quantite),
            motif: 'import',
          });
        }
      }
    }
    for (const u of aMaj) {
      if (!u.delta) continue;
      // Réappro ATOMIQUE et journalisée côté serveur (`stock_mouvement`, motif
      // import) : pas de lecture-modification-écriture, pas de double trace.
      const { error } = await supabase.rpc('stock_mouvement', { p_id: u.id, p_delta: u.delta, p_motif: 'import' });
      if (error) { console.error('Import stocks — réappro:', error); erreurs.push('réappro'); break; }
    }
    setEnCours(false);
    if (erreurs.length) { setStatut(`Import impossible (${erreurs.join(', ')}). Vérifie le fichier et réessaie.`); return; }
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

      <div className="bascule bascule-mini">
        <button className={mode === 'tableur' ? 'actif' : ''} onClick={() => setMode('tableur')}>Tableur</button>
        <button className={mode === 'chromes' ? 'actif' : ''} onClick={() => setMode('chromes')}>Dettes</button>
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
            <div className="form-inline">
              <label className="btn btn-primary">
                Choisir les fichiers CSV…
                <input type="file" accept=".csv,text/csv" multiple style={{ display: 'none' }} onChange={choisirFichiers} />
              </label>
              <button type="button" className="btn btn-discret" onClick={() => telechargerModele('caisse')}>
                ⬇️ Télécharger un modèle
              </button>
            </div>
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
            <div className="form-inline">
              <label className="btn btn-primary">
                Choisir le fichier CSV…
                <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={choisirChromes} />
              </label>
              <button type="button" className="btn btn-discret" onClick={() => telechargerModele('chromes')}>
                ⬇️ Télécharger un modèle
              </button>
            </div>
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
                <table className="tableau tableau-cartes">
                  <thead><tr><th>Date</th><th>Client</th><th>Type</th><th className="droite">Montant</th></tr></thead>
                  <tbody>
                    {chromes.slice(0, 12).map((l, i) => (
                      <tr key={i}>
                        <td data-label="Date">{formatDateFr(l.date)}</td>
                        <td data-label="Client">{l.surnom}</td>
                        <td data-label="Type">{l.type === 'avance' ? 'Avance' : 'Remboursement'}</td>
                        <td className={`droite ${l.type === 'avance' ? 'dette' : 'solde-ok'}`} data-label="Montant">{formatEuros(l.montant)}</td>
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
            <div className="form-inline">
              <label className="btn btn-primary">
                Choisir le fichier CSV…
                <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={choisirStocks} />
              </label>
              <button type="button" className="btn btn-discret" onClick={() => telechargerModele('stocks')}>
                ⬇️ Télécharger un modèle
              </button>
            </div>
          </div>

          {stocks && (
            <>
              <div className="cartes-kpi">
                <div className="kpi"><span className="kpi-label">Lignes</span><span className="kpi-valeur">{stocks.length}</span></div>
                <div className="kpi"><span className="kpi-label">Quantité totale</span><span className="kpi-valeur">{formatNombre(somme(stocks.map((s) => s.quantite)))}</span></div>
              </div>
              <div className="card">
                <h2>Aperçu</h2>
                <table className="tableau tableau-cartes">
                  <thead><tr><th>Catégorie</th><th>Produit</th><th className="droite">Quantité</th></tr></thead>
                  <tbody>
                    {stocks.slice(0, 12).map((s, i) => (
                      <tr key={i}>
                        <td data-label="Catégorie">{catForcee.trim() || s.categorie || '—'}</td>
                        <td data-label="Produit">{s.nom}</td>
                        <td className="droite" data-label="Quantité">{formatNombre(s.quantite)} {uniteDefaut}</td>
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
