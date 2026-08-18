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

// Rattache une saisie à une catégorie existante si elle ne diffère que par la
// casse ou les espaces — évite les doublons (« Fleurs » vs « fleurs » vs « Fleurs  »).
function canoniserCategorie(saisie, categories) {
  const t = (saisie ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  const existante = categories.find((c) => c.toLowerCase() === t.toLowerCase());
  return existante || t;
}

// Sélecteur de catégorie : on choisit dans les catégories existantes (pour ne
// pas recréer un doublon à cause d'une faute de frappe) ou on en crée une.
function ChampCategorie({ valeur, onChange, categories, label = 'Catégorie', autoFocus }) {
  const [nouvelle, setNouvelle] = useState(false);
  const afficherListe = categories.length > 0 && !nouvelle;
  return (
    <label className="field">
      <span>{label}</span>
      {afficherListe ? (
        <select
          value={categories.includes(valeur) ? valeur : ''}
          onChange={(e) => {
            if (e.target.value === '__nouvelle__') {
              setNouvelle(true);
              onChange('');
            } else {
              onChange(e.target.value);
            }
          }}
        >
          <option value="" disabled>
            Choisir une catégorie…
          </option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value="__nouvelle__">＋ Nouvelle catégorie…</option>
        </select>
      ) : (
        <>
          <input
            autoFocus={autoFocus}
            value={valeur}
            placeholder="ex. Fleurs, Résines, Huiles…"
            onChange={(e) => onChange(e.target.value)}
          />
          {categories.length > 0 && (
            <button
              type="button"
              className="btn btn-discret lien-retour-cat"
              onClick={() => {
                setNouvelle(false);
                onChange('');
              }}
            >
              ↩ Choisir une catégorie existante
            </button>
          )}
        </>
      )}
    </label>
  );
}

// Module — Gestion des stocks (registre partagé : tout employé consulte et
// ajuste ; seul l'admin supprime un produit).
export default function Stocks() {
  const { estAdmin } = useAuth();
  const [produits, setProduits] = useState([]);
  const [statut, setStatut] = useState('');
  const [recherche, setRecherche] = useState('');
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [form, setForm] = useState(FORM_VIDE);
  const [edition, setEdition] = useState(null); // id en cours d'édition
  const [editForm, setEditForm] = useState(FORM_VIDE);
  const [delta, setDelta] = useState({}); // id -> mouvement saisi (string)
  const [importOuvert, setImportOuvert] = useState(false);
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);
  const [tri, setTri] = useState('nom'); // 'nom' | 'quantite'

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

  // Catégories réellement saisies (pour le sélecteur à la création/import).
  const categoriesReelles = [...new Set(produits.map((p) => (p.categorie ?? '').trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );

  async function creer(e) {
    e.preventDefault();
    const nom = form.nom.trim();
    if (!nom) return;
    const quantite = parseMontant(form.quantite);
    const { data, error } = await supabase
      .from('stocks')
      .insert({
        categorie: canoniserCategorie(form.categorie, categoriesReelles),
        nom,
        quantite,
        unite: form.unite,
        seuil_alerte: parseMontant(form.seuil_alerte),
        prix_achat: parseMontant(form.prix_achat),
        prix_vente: parseMontant(form.prix_vente),
      })
      .select('id')
      .single();
    if (error) {
      setStatut(`Ajout impossible : ${error.message}`);
      return;
    }
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
    setStatut(`« ${nom} » ajouté ✅`);
    charger();
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
        categorie: canoniserCategorie(editForm.categorie, categoriesReelles),
        nom,
        quantite: nouvelleQte,
        unite: editForm.unite,
        seuil_alerte: parseMontant(editForm.seuil_alerte),
        prix_achat: parseMontant(editForm.prix_achat),
        prix_vente: parseMontant(editForm.prix_vente),
      })
      .eq('id', id);
    if (error) {
      setStatut(`Modification impossible : ${error.message}`);
      return;
    }
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
    setStatut(`« ${nom} » modifié ✅`);
    charger();
  }

  async function supprimer(id) {
    if (!window.confirm('Supprimer ce produit du stock ?')) return;
    const produit = produits.find((p) => p.id === id);
    const { error } = await supabase.from('stocks').delete().eq('id', id);
    if (error) {
      setStatut(`Suppression impossible : ${error.message}`);
      return;
    }
    if (produit && Number(produit.quantite) > 0) {
      // Le produit part avec sa quantité : on trace la sortie correspondante.
      await journaliserMouvement({
        stock_id: null, // la ligne stock disparaît (on delete set null)
        produit: produit.nom,
        delta: -Number(produit.quantite),
        quantite_apres: 0,
        motif: 'suppression',
      });
    }
    setStatut('Produit supprimé.');
    charger();
  }

  // Mouvement de stock : entrée (+) ou sortie (−) de la quantité saisie.
  async function mouvement(p, signe) {
    const d = parseMontant(delta[p.id] ?? '');
    if (d <= 0) return;
    const nouvelle = Math.max(0, arrondi(Number(p.quantite) + signe * d));
    const { error } = await supabase.from('stocks').update({ quantite: nouvelle }).eq('id', p.id);
    if (error) {
      setStatut(`Mouvement impossible : ${error.message}`);
      return;
    }
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
    // Si la fiche du produit est ouverte, on synchronise le champ Quantité pour
    // qu'un « Enregistrer » ne réécrive pas l'ancienne valeur par-dessus.
    setEditForm((f) => (edition === p.id ? { ...f, quantite: String(nouvelle) } : f));
    setStatut(`${p.nom} : ${formatNombre(nouvelle)} ${p.unite} en stock`);
    charger();
  }

  const filtres = produits.filter((p) =>
    `${p.categorie ?? ''} ${p.nom}`.toLowerCase().includes(recherche.toLowerCase()),
  );
  const enAlerte = (p) => Number(p.seuil_alerte) > 0 && Number(p.quantite) <= Number(p.seuil_alerte);
  const valeurStock = somme(produits.map((p) => arrondi(Number(p.quantite) * Number(p.prix_achat))));
  const nbAlertes = produits.filter(enAlerte).length;

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
        {creationOuverte ? (
          <form className="form-chrome" onSubmit={creer}>
            <ChampCategorie
              label="Catégorie / type de produit"
              valeur={form.categorie}
              onChange={(v) => setForm((f) => ({ ...f, categorie: v }))}
              categories={categoriesReelles}
            />
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
          <div className="stocks-outils">
            <div className="bascule bascule-mini">
              <button type="button" className={tri === 'nom' ? 'actif' : ''} onClick={() => setTri('nom')}>
                Par nom
              </button>
              <button type="button" className={tri === 'quantite' ? 'actif' : ''} onClick={() => setTri('quantite')}>
                Par quantité
              </button>
            </div>
            <div className="stocks-actions">
              <button
                type="button"
                className="btn btn-primary btn-compact"
                onClick={() => {
                  setForm(FORM_VIDE);
                  setCreationOuverte(true);
                }}
              >
                + Produit
              </button>
              <button
                type="button"
                className="btn btn-compact btn-icone"
                title="Importer depuis une facture"
                aria-label="Importer depuis une facture"
                onClick={() => setImportOuvert(true)}
              >
                📄
              </button>
              <button
                type="button"
                className="btn btn-compact btn-icone"
                title="Historique des mouvements"
                aria-label="Historique des mouvements"
                onClick={() => setHistoriqueOuvert(true)}
              >
                📋
              </button>
            </div>
          </div>
        )}
        {statut && <p className="statut">{statut}</p>}
      </div>

      {historiqueOuvert && <HistoriqueStock onClose={() => setHistoriqueOuvert(false)} />}

      {importOuvert && (
        <ImportFacture
          categories={categoriesReelles}
          onClose={() => setImportOuvert(false)}
          onImported={() => charger()}
        />
      )}

      {categories.length === 0 && (
        <div className="card etat-vide">
          <p className="vide">Aucun produit en stock.</p>
          {!creationOuverte && (
            <button
              className="btn btn-primary"
              onClick={() => {
                setForm(FORM_VIDE);
                setCreationOuverte(true);
              }}
            >
              + Ajouter un premier produit
            </button>
          )}
        </div>
      )}

      {categories.map((cat) => (
        <div key={cat} className="card">
          <h2>{cat}</h2>
          {/* Liste compacte, pensée mobile : nom + quantité + bouton « Gérer »
              qui ouvre la fiche produit (mouvements, édition, suppression). */}
          <ul className="liste-produits">
            {parCategorie[cat].map((p) => (
              <li key={p.id} className="ligne-produit">
                <div className="ligne-produit-nom">
                  <span>{p.nom}</span>
                  {Number(p.quantite) === 0 ? (
                    <span className="badge badge-dette tag-partage">Rupture</span>
                  ) : enAlerte(p) ? (
                    <span className="badge badge-dette tag-partage">Stock bas</span>
                  ) : null}
                </div>
                <span className={`ligne-produit-qte ${enAlerte(p) ? 'dette' : ''}`}>
                  {formatNombre(p.quantite)} {p.unite}
                </span>
                <button type="button" className="btn btn-discret ligne-produit-gerer" onClick={() => commencerEdition(p)}>
                  Gérer
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {edition && (() => {
        const p = produits.find((x) => x.id === edition);
        if (!p) return null;
        return (
        <div
          className="aide-fond"
          role="dialog"
          aria-modal="true"
          aria-label="Fiche produit"
          onClick={() => setEdition(null)}
        >
          <div className="modale-client" onClick={(e) => e.stopPropagation()}>
            <div className="modale-client-tete">
              <strong>{p.nom}</strong>
              <button type="button" className="btn btn-discret" onClick={() => setEdition(null)}>
                Fermer
              </button>
            </div>

            {/* Mouvement rapide : entrée / sortie de stock sans tout ré-éditer. */}
            <div className="fiche-mouvement">
              <div className="fiche-mouvement-tete">
                <span className="fiche-mouvement-titre">Mouvement rapide</span>
                <span className={`fiche-mouvement-stock ${enAlerte(p) ? 'dette' : ''}`}>
                  {formatNombre(p.quantite)} {p.unite} en stock
                </span>
              </div>
              <div className="mouvement">
                <input
                  className="champ-mini"
                  inputMode="decimal"
                  placeholder="0"
                  value={delta[p.id] ?? ''}
                  onChange={(e) => setDelta((x) => ({ ...x, [p.id]: e.target.value }))}
                />
                <button type="button" className="btn btn-discret" onClick={() => mouvement(p, 1)}>
                  + Entrée
                </button>
                <button type="button" className="btn btn-discret" onClick={() => mouvement(p, -1)}>
                  − Sortie
                </button>
              </div>
            </div>

            <div className="form-chrome">
              <label className="field">
                <span>Produit</span>
                <input value={editForm.nom} onChange={(e) => setEditForm((f) => ({ ...f, nom: e.target.value }))} />
              </label>
              <ChampCategorie
                key={edition}
                valeur={editForm.categorie}
                onChange={(v) => setEditForm((f) => ({ ...f, categorie: v }))}
                categories={categoriesReelles}
              />
              <div className="form-inline">
                <ChampMontant label="Quantité" valeur={editForm.quantite} onChange={(v) => setEditForm((f) => ({ ...f, quantite: v }))} />
                <label className="field">
                  <span>Unité</span>
                  <select value={editForm.unite} onChange={(e) => setEditForm((f) => ({ ...f, unite: e.target.value }))}>
                    {UNITES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <ChampMontant label="Seuil d’alerte" valeur={editForm.seuil_alerte} onChange={(v) => setEditForm((f) => ({ ...f, seuil_alerte: v }))} />
              <div className="form-inline">
                <ChampMontant label="Prix d’achat (unité)" valeur={editForm.prix_achat} onChange={(v) => setEditForm((f) => ({ ...f, prix_achat: v }))} />
                <ChampMontant label="Prix de vente (unité)" valeur={editForm.prix_vente} onChange={(v) => setEditForm((f) => ({ ...f, prix_vente: v }))} />
              </div>
              <div className="form-inline">
                <button className="btn btn-primary" type="button" onClick={() => enregistrerEdition(edition)}>
                  Enregistrer
                </button>
                <button className="btn" type="button" onClick={() => setEdition(null)}>
                  Annuler
                </button>
              </div>
              {estAdmin && (
                <button
                  className="btn btn-discret fiche-supprimer"
                  type="button"
                  onClick={() => supprimer(edition)}
                >
                  🗑 Supprimer ce produit
                </button>
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
