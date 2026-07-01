import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatNombre } from '../lib/format';

// Libellés lisibles des motifs de mouvement.
const MOTIFS = {
  entree: 'Entrée',
  sortie: 'Sortie',
  creation: 'Création',
  correction: 'Correction',
  import: 'Import',
  suppression: 'Suppression',
  mouvement: 'Mouvement',
};

// Formate un horodatage complet (date + heure) en français.
function formatDateHeure(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

// Modale — Historique INVIOLABLE des mouvements de stock.
// Registre append-only : on voit qui a ajouté / retiré du stock, quand et
// pourquoi. Personne ne peut modifier ni supprimer une ligne (garanti par la
// RLS côté serveur) ; une erreur se corrige par un mouvement inverse, lui aussi
// tracé. Lecture seule ici.
export default function HistoriqueStock({ onClose }) {
  const [lignes, setLignes] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let actif = true;
    (async () => {
      const { data } = await supabase
        .from('stock_mouvements')
        .select('id, produit, delta, quantite_apres, motif, created_at, auteur:employe_id(nom)')
        .order('created_at', { ascending: false })
        .limit(500);
      if (actif) {
        setLignes(data ?? []);
        setChargement(false);
      }
    })();
    return () => {
      actif = false;
    };
  }, []);

  const q = recherche.trim().toLowerCase();
  const filtres = q
    ? lignes.filter((l) =>
        `${l.produit ?? ''} ${l.auteur?.nom ?? ''} ${MOTIFS[l.motif] ?? l.motif}`
          .toLowerCase()
          .includes(q),
      )
    : lignes;

  return (
    <div className="aide-fond" role="dialog" aria-modal="true" aria-label="Historique des mouvements de stock" onClick={onClose}>
      <div className="modale-client" onClick={(e) => e.stopPropagation()}>
        <div className="modale-client-tete">
          <strong>📋 Historique des mouvements de stock</strong>
          <button type="button" className="btn btn-discret" onClick={onClose}>
            Fermer
          </button>
        </div>

        <p className="statut">
          Registre sécurisé : chaque entrée est définitive. Pour corriger une
          erreur, faites le mouvement inverse (il sera lui aussi tracé).
        </p>

        <input
          type="search"
          placeholder="Rechercher un produit, un employé…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />

        {chargement ? (
          <p className="statut">Chargement…</p>
        ) : filtres.length === 0 ? (
          <p className="vide">Aucun mouvement enregistré.</p>
        ) : (
          <table className="tableau">
            <thead>
              <tr>
                <th>Date</th>
                <th>Produit</th>
                <th>Employé</th>
                <th>Motif</th>
                <th className="droite">Mouvement</th>
                <th className="droite">Stock après</th>
              </tr>
            </thead>
            <tbody>
              {filtres.map((l) => {
                const positif = Number(l.delta) > 0;
                return (
                  <tr key={l.id}>
                    <td>{formatDateHeure(l.created_at)}</td>
                    <td>{l.produit}</td>
                    <td>{l.auteur?.nom ?? '—'}</td>
                    <td>{MOTIFS[l.motif] ?? l.motif}</td>
                    <td className={`droite ${positif ? 'solde-ok' : 'dette'}`}>
                      {positif ? '+' : '−'}
                      {formatNombre(Math.abs(Number(l.delta)))}
                    </td>
                    <td className="droite">
                      {l.quantite_apres == null ? '—' : formatNombre(l.quantite_apres)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
