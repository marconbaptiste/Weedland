import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { parseMontant, formatEuros, formatNombre } from '../lib/format';
import { somme } from '../lib/comptabilite';
import ChampMontant from '../components/ChampMontant';
import ImportFacture from '../components/ImportFacture';
import ListeCourses from '../components/ListeCourses';
import HistoriqueStock from '../components/HistoriqueStock';
import { journaliserMouvement } from '../lib/mouvementsStock';

const UNITES = ['g', 'kg', 'mg', 'ml', 'pièce'];
const FORM_VIDE = {
  categorie: '',
  nom: '',
  quantite: '',
  unite: 'g',
  seuil_alerte: '',
  prix_achat: '',
  prix_vente: '',
};

// Arrondi à 2 décimales (évite les erreurs de virgule flottante sur les quantités).
const arrondi = (n) => Math.round(n * 100) / 100;

// Module — Gestion des stocks (registre partagé : tout employé consulte et
// ajuste ; seul l'admin supprime un produit).
export default function Stocks() {
  const { estAdmin } = useAuth();
  const [produits, setProduits] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [edition, setEdition] = useState(null); // id en cours d'édition
  const [editForm, setEditForm] = useState(FORM_VIDE);
  const [delta, setDelta] = useState({}); // id -> mouvement saisi (string)
  const [importOuvert, setImportOuvert] = useState(false);
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);
  const [tri, setTri] = useState('nom'); // 'nom' | 'quantite'
  const [nouvelleCat, setNouvelleCat] = useState(false); // saisie d'une nouvelle catégorie à la création

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('stocks')
      .select('*')
      .order('categorie', { ascending: true })
      .order('nom', { ascending: true });
    setProduits(data ?? []);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function creer(e) {
    e.preventDefault();
    const nom = form.nom.trim();
    if (!nom) return;
    const quantite = parseMontant(form.quantite);
    const { data, error } = await supabase
      .from('stocks')
      .insert({
        categorie: form.categorie.trim(),
        nom,
        quantite,
        unite: form.unite,
        seuil_alerte: parseMontant(form.seuil_alerte),
        prix_achat: parseMontant(form.prix_achat),
        prix_vente: parseMontant(form.prix_vente),
      })
      .select('id')
      .single();
    if (!error) {
      if (quantite > 0) {
        await journaliserMouvement({
          stock_id: data?.id ?? null,
          produit: nom,
          delta: quantite,
          quantite_apres: quantite,
          motif: 'creation',
        });
      }
      setForm(FORM_VIDE);
      setCreationOuverte(false);
      charger();
    }
  }

  function commencerEdition(p) {
    setEdition(p.id);
    setEditForm({
      categorie: p.categorie ?? '',
      nom: p.nom,
      quantite: String(p.quantite),
      unite: p.unite,
      seuil_alerte: String(p.seuil_alerte),
      prix_achat: String(p.prix_achat),
      prix_vente: String(p.prix_vente),
    });
  }

  async function enregistrerEdition(id) {
    const nom = editForm.nom.trim();
    if (!nom) return;
    const ancien = produits.find((p) => p.id === id);
    const nouvelleQte = parseMontant(editForm.quantite);
    const { error } = await supabase
      .from('stocks')
      .update({
        categorie: editForm.categorie.trim(),
        nom,
        quantite: nouvelleQte,
        unite: editForm.unite,
        seuil_alerte: parseMontant(editForm.seuil_alerte),
        prix_achat: parseMontant(editForm.prix_achat),
        prix_vente: parseMontant(editForm.prix_vente),
      })
      .eq('id', id);
    if (!error) {
      const ecart = ancien ? arrondi(nouvelleQte - Number(ancien.quantite)) : 0;
      if (ecart !== 0) {
        await journaliserMouvement({
          stock_id: id,
          produit: nom,
          delta: ecart,
          quantite_apres: nouvelleQte,
          motif: 'correction',
        });
      }
      setEdition(null);
      charger();
    }
  }

  async function supprimer(id) {
    if (!window.confirm('Supprimer ce produit du stock ?')) return;
    const produit = produits.find((p) => p.id === id);
    const { error } = await supabase.from('stocks').delete().eq('id', id);
    if (!error && produit && Number(produit.quantite) > 0) {
      // Le produit part avec sa quantité : on trace la sortie correspondante.
      await journaliserMouvement({
        stock_id: null, // la ligne stock disparaît (on delete set null)
        produit: produit.nom,
        delta: -Number(produit.quantite),
        quantite_apres: 0,
        motif: 'suppression',
      });
    }
    charger();
  }

  // Mouvement de stock : entrée (+) ou sortie (−) de la quantité saisie.
  async function mouvement(p, signe) {
    const d = parseMontant(delta[p.id] ?? '');
    if (d <= 0) return;
    const nouvelle = Math.max(0, arrondi(Number(p.quantite) + signe * d));
    const { error } = await supabase.from('stocks').update({ quantite: nouvelle }).eq('id', p.id);
    if (!error) {
      // On trace la variation réelle (le stock ne descend jamais sous 0).
      const ecart = arrondi(nouvelle - Number(p.quantite));
      if (ecart !== 0) {
        await journaliserMouvement({
          stock_id: p.id,
          produit: p.nom,
          delta: ecart,
          quantite_apres: nouvelle,
          motif: signe > 0 ? 'entree' : 'sortie',
        });
      }
      setDelta((x) => ({ ...x, [p.id]: '' }));
      charger();
    }
  }

  const filtres = produits.filter((p) =>
    `${p.categorie ?? ''} ${p.nom}`.toLowerCase().includes(recherche.toLowerCase()),
  );
  const enAlerte = (p) => Number(p.seuil_alerte) > 0 && Number(p.quantite) <= Number(p.seuil_alerte);
  const valeurStock = somme(produits.map((p) => arrondi(Number(p.quantite) * Number(p.prix_achat))));
  const nbAlertes = produits.filter(enAlerte).length;

  // Catégories réellement saisies (pour le sélecteur à la création/import).
  const categoriesReelles = [...new Set(produits.map((p) => (p.categorie ?? '').trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );

  // Regroupement par catégorie pour l'affichage.
  const parCategorie = {};
  filtres.forEach((p) => {
    const cle = p.categorie?.trim() || 'Sans catégorie';
    (parCategorie[cle] ??= []).push(p);
  });
  // Tri des produits DANS chaque catégorie : par nom (A→Z) ou par quantité (↓).
  const comparer =
    tri === 'quantite'
      ? (a, b) => Number(b.quantite) - Number(a.quantite) || a.nom.localeCompare(b.nom)
      : (a, b) => a.nom.localeCompare(b.nom);
  Object.values(parCategorie).forEach((arr) => arr.sort(comparer));
  const categories = Object.keys(parCategorie).sort((a, b) => a.localeCompare(b));

  return (
    <div className="page">
      <h1>Stocks</h1>

      <ListeCourses />

      <div className="cartes-kpi">
        <div className="kpi">
          <span className="kpi-label">Produits</span>
          <span className="kpi-valeur">{produits.length}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Valeur du stock (achat)</span>
          <span className="kpi-valeur">{formatEuros(valeurStock)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Alertes réappro</span>
          <span className={`kpi-valeur ${nbAlertes > 0 ? 'dette' : 'solde-ok'}`}>{nbAlertes}</span>
        </div>
      </div>

      <div className="card">
        <input
          type="search"
          placeholder="Rechercher un produit ou une catégorie…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <div className="tri-ligne">
          <span className="tri-label">Classer&nbsp;:</span>
          <div className="bascule">
            <button type="button" className={tri === 'nom' ? 'actif' : ''} onClick={() => setTri('nom')}>
              Par nom
            </button>
            <button type="button" className={tri === 'quantite' ? 'actif' : ''} onClick={() => setTri('quantite')}>
              Par quantité
            </button>
          </div>
        </div>
        {creationOuverte ? (
          <form className="form-chrome" onSubmit={creer}>
            <label className="field">
              <span>Catégorie / type de produit</span>
              {categoriesReelles.length > 0 && !nouvelleCat ? (
                <select
                  value={form.categorie}
                  onChange={(e) => {
                    if (e.target.value === '__nouvelle__') {
                      setNouvelleCat(true);
                      setForm((f) => ({ ...f, categorie: '' }));
                    } else {
                      setForm((f) => ({ ...f, categorie: e.target.value }));
                    }
                  }}
                >
                  <option value="" disabled>
                    Choisir une catégorie…
                  </option>
                  {categoriesReelles.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="__nouvelle__">＋ Nouvelle catégorie…</option>
                </select>
              ) : (
                <input
                  value={form.categorie}
                  onChange={(e) => setForm((f) => ({ ...f, categorie: e.target.value }))}
                  placeholder="ex. Fleurs, Résines, Huiles…"
                />
              )}
              {categoriesReelles.length > 0 && nouvelleCat && (
                <button
                  type="button"
                  className="btn btn-discret lien-retour-cat"
                  onClick={() => {
                    setNouvelleCat(false);
                    setForm((f) => ({ ...f, categorie: '' }));
                  }}
                >
                  ↩ Choisir une catégorie existante
                </button>
              )}
            </label>
            <label className="field">
              <span>Produit</span>
              <input
                autoFocus
                value={form.nom}
                onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                placeholder="ex. Amnesia"
              />
            </label>
            <div className="form-inline">
              <ChampMontant label="Quantité" valeur={form.quantite} onChange={(v) => setForm((f) => ({ ...f, quantite: v }))} />
              <label className="field">
                <span>Unité</span>
                <select value={form.unite} onChange={(e) => setForm((f) => ({ ...f, unite: e.target.value }))}>
                  {UNITES.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <ChampMontant label="Seuil d’alerte" valeur={form.seuil_alerte} onChange={(v) => setForm((f) => ({ ...f, seuil_alerte: v }))} />
            <div className="form-inline">
              <ChampMontant label="Prix d’achat (unité)" valeur={form.prix_achat} onChange={(v) => setForm((f) => ({ ...f, prix_achat: v }))} />
              <ChampMontant label="Prix de vente (unité)" valeur={form.prix_vente} onChange={(v) => setForm((f) => ({ ...f, prix_vente: v }))} />
            </div>
            <div className="form-inline">
              <button className="btn btn-primary" type="submit">
                Ajouter le produit
              </button>
              <button className="btn" type="button" onClick={() => setCreationOuverte(false)}>
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <div className="form-inline">
            <button
              className="btn"
              onClick={() => {
                setNouvelleCat(false);
                setForm(FORM_VIDE);
                setCreationOuverte(true);
              }}
            >
              + Ajouter un produit
            </button>
            <button type="button" className="btn" onClick={() => setImportOuvert(true)}>
              📄 Importer depuis une facture
            </button>
            <button type="button" className="btn" onClick={() => setHistoriqueOuvert(true)}>
              📋 Historique des mouvements
            </button>
          </div>
        )}
      </div>

      {historiqueOuvert && <HistoriqueStock onClose={() => setHistoriqueOuvert(false)} />}

      {importOuvert && (
        <ImportFacture
          categories={categoriesReelles}
          onClose={() => setImportOuvert(false)}
          onImported={() => charger()}
        />
      )}

      {categories.length === 0 && <p className="vide">Aucun produit en stock.</p>}

      {categories.map((cat) => (
        <div key={cat} className="card">
          <h2>{cat}</h2>
          <table className="tableau">
            <thead>
              <tr>
                <th>Produit</th>
                <th className="droite">Quantité</th>
                <th>Mouvement</th>
                <th className="droite">Prix vente</th>
                <th className="droite">Valeur</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {parCategorie[cat].map((p) =>
                edition === p.id ? (
                  <tr key={p.id}>
                    <td>
                      <input
                        className="champ-nom"
                        value={editForm.nom}
                        onChange={(e) => setEditForm((f) => ({ ...f, nom: e.target.value }))}
                      />
                      <input
                        className="champ-nom"
                        value={editForm.categorie}
                        placeholder="catégorie"
                        onChange={(e) => setEditForm((f) => ({ ...f, categorie: e.target.value }))}
                      />
                    </td>
                    <td className="droite">
                      <input
                        className="champ-pourcentage"
                        inputMode="decimal"
                        value={editForm.quantite}
                        onChange={(e) => setEditForm((f) => ({ ...f, quantite: e.target.value }))}
                      />
                      <select value={editForm.unite} onChange={(e) => setEditForm((f) => ({ ...f, unite: e.target.value }))}>
                        {UNITES.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="champ-pourcentage"
                        inputMode="decimal"
                        placeholder="seuil"
                        value={editForm.seuil_alerte}
                        onChange={(e) => setEditForm((f) => ({ ...f, seuil_alerte: e.target.value }))}
                      />
                    </td>
                    <td className="droite">
                      <input
                        className="champ-pourcentage"
                        inputMode="decimal"
                        value={editForm.prix_vente}
                        onChange={(e) => setEditForm((f) => ({ ...f, prix_vente: e.target.value }))}
                      />
                    </td>
                    <td className="droite">
                      <input
                        className="champ-pourcentage"
                        inputMode="decimal"
                        placeholder="achat"
                        value={editForm.prix_achat}
                        onChange={(e) => setEditForm((f) => ({ ...f, prix_achat: e.target.value }))}
                      />
                    </td>
                    <td className="actions-cellule">
                      <button type="button" className="btn btn-discret" onClick={() => enregistrerEdition(p.id)}>
                        Enregistrer
                      </button>
                      <button type="button" className="btn btn-discret" onClick={() => setEdition(null)}>
                        Annuler
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id}>
                    <td>
                      {p.nom}
                      {Number(p.quantite) === 0 ? (
                        <span className="badge badge-dette tag-partage">Rupture</span>
                      ) : enAlerte(p) ? (
                        <span className="badge badge-dette tag-partage">Stock bas</span>
                      ) : null}
                    </td>
                    <td className={`droite ${enAlerte(p) ? 'dette' : ''}`}>
                      {formatNombre(p.quantite)} {p.unite}
                    </td>
                    <td>
                      <div className="mouvement">
                        <input
                          className="champ-mini"
                          inputMode="decimal"
                          placeholder="0"
                          value={delta[p.id] ?? ''}
                          onChange={(e) => setDelta((x) => ({ ...x, [p.id]: e.target.value }))}
                        />
                        <button type="button" className="btn btn-discret" onClick={() => mouvement(p, 1)} aria-label="Entrée de stock">
                          +
                        </button>
                        <button type="button" className="btn btn-discret" onClick={() => mouvement(p, -1)} aria-label="Sortie de stock">
                          −
                        </button>
                      </div>
                    </td>
                    <td className="droite">{formatEuros(p.prix_vente)}</td>
                    <td className="droite">{formatEuros(arrondi(Number(p.quantite) * Number(p.prix_achat)))}</td>
                    <td className="actions-cellule">
                      <button type="button" className="btn btn-discret" onClick={() => commencerEdition(p)}>
                        Modifier
                      </button>
                      {estAdmin && (
                        <button type="button" className="btn btn-discret" onClick={() => supprimer(p.id)} aria-label="Supprimer le produit">
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
