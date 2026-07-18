import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { parseMontant } from '../lib/format';
import { compresserImage } from '../lib/image';
import { lireTexte, extraireLignesFacture } from '../lib/ocr';

const UNITES = ['g', 'kg', 'mg', 'ml', 'pièce'];

// Modale — Import de produits depuis une facture fournisseur.
// Flux : on choisit une catégorie, on photographie/charge la facture, l'OCR
// pré-remplit des lignes (produit + quantité), l'utilisateur valide/corrige,
// puis tout est ajouté au stock d'un coup.
export default function ImportFacture({ categories = [], onClose, onImported }) {
  const [categorie, setCategorie] = useState('');
  const [lignes, setLignes] = useState([]);
  const [traitement, setTraitement] = useState(false);
  const [msg, setMsg] = useState('');

  async function surFichier(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg('');
    setTraitement(true);
    try {
      const blob = await compresserImage(file);
      const texte = await lireTexte(blob);
      const detectees = extraireLignesFacture(texte);
      setLignes(detectees.length ? detectees : [{ produit: '', quantite: '', unite: 'g' }]);
      setMsg(
        detectees.length
          ? `${detectees.length} ligne(s) détectée(s) — vérifie et corrige avant d’ajouter.`
          : 'Aucune ligne détectée automatiquement — saisis-les à la main.',
      );
    } catch {
      setMsg('Lecture de la facture impossible. Réessaie ou saisis à la main.');
      setLignes([{ produit: '', quantite: '', unite: 'g' }]);
    } finally {
      setTraitement(false);
    }
  }

  const majLigne = (i, champ, valeur) =>
    setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, [champ]: valeur } : l)));
  const retirerLigne = (i) => setLignes((ls) => ls.filter((_, j) => j !== i));
  const ajouterLigne = () =>
    setLignes((ls) => [...ls, { produit: '', quantite: '', unite: 'g' }]);

  async function enregistrer() {
    const aInserer = lignes
      .filter((l) => l.produit.trim())
      .map((l) => ({
        categorie: categorie.trim(),
        nom: l.produit.trim(),
        quantite: parseMontant(l.quantite),
        unite: l.unite,
        seuil_alerte: 0,
        prix_achat: 0,
        prix_vente: 0,
      }));
    if (aInserer.length === 0) {
      setMsg('Renseigne au moins un produit.');
      return;
    }
    const { error } = await supabase.from('stocks').insert(aInserer);
    if (error) {
      setMsg(`Ajout impossible : ${error.message}`);
      return;
    }
    onImported?.(aInserer.length);
    onClose();
  }

  return (
    <div className="aide-fond" role="dialog" aria-modal="true" aria-label="Import facture" onClick={onClose}>
      <div className="modale-client" onClick={(e) => e.stopPropagation()}>
        <div className="modale-client-tete">
          <strong>📄 Importer depuis une facture</strong>
          <button type="button" className="btn btn-discret" onClick={onClose}>
            Fermer
          </button>
        </div>

        <label className="field">
          <span>Catégorie (appliquée à toutes les lignes)</span>
          <input
            list="categories-import"
            value={categorie}
            onChange={(e) => setCategorie(e.target.value)}
            placeholder="ex. Fleurs, Résines, Huiles…"
          />
          <datalist id="categories-import">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <label className="field">
          <span>Facture (photo)</span>
          <input type="file" accept="image/*" capture="environment" onChange={surFichier} />
        </label>

        {traitement && <p className="statut">Lecture de la facture en cours…</p>}
        {msg && <p className="statut">{msg}</p>}

        {lignes.length > 0 && (
          <table className="tableau">
            <thead>
              <tr>
                <th>Produit</th>
                <th className="droite">Quantité</th>
                <th>Unité</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={i}>
                  <td>
                    <input
                      className="champ-nom"
                      value={l.produit}
                      onChange={(e) => majLigne(i, 'produit', e.target.value)}
                      placeholder="Nom du produit"
                    />
                  </td>
                  <td className="droite">
                    <input
                      className="champ-pourcentage"
                      inputMode="decimal"
                      value={l.quantite}
                      onChange={(e) => majLigne(i, 'quantite', e.target.value)}
                    />
                  </td>
                  <td>
                    <select value={l.unite} onChange={(e) => majLigne(i, 'unite', e.target.value)}>
                      {UNITES.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="actions-cellule">
                    <button
                      type="button"
                      className="btn btn-discret"
                      onClick={() => retirerLigne(i)}
                      aria-label="Retirer la ligne"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="form-inline">
          <button type="button" className="btn" onClick={ajouterLigne}>
            + Ligne
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={enregistrer}
            disabled={traitement || lignes.length === 0}
          >
            Ajouter au stock
          </button>
        </div>
      </div>
    </div>
  );
}
