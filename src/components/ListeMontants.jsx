import { formatEuros } from '../lib/format';

// Liste éditable de montants (charges ou fournisseurs) : libellé + montant par
// ligne, total, ajout/suppression et reprise du mois précédent.
export default function ListeMontants({
  titre,
  items,
  total,
  onAjouter,
  onMaj,
  onEnregistrer,
  onSupprimer,
  onCopierPrecedent,
}) {
  return (
    <div className="card">
      <div className="entete-client">
        <h2>{titre}</h2>
        <strong>{formatEuros(total)}</strong>
      </div>
      <table className="tableau">
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>
                <input
                  className="champ-nom"
                  placeholder="Libellé"
                  value={it.libelle ?? ''}
                  onChange={(e) => onMaj(it.id, 'libelle', e.target.value)}
                  onBlur={() => onEnregistrer(it.id)}
                />
              </td>
              <td className="droite">
                <input
                  className="champ-pourcentage"
                  inputMode="decimal"
                  placeholder="0"
                  value={it.montant ?? ''}
                  onChange={(e) => onMaj(it.id, 'montant', e.target.value)}
                  onBlur={() => onEnregistrer(it.id)}
                />
              </td>
              <td>
                <button
                  type="button"
                  className="btn btn-discret"
                  onClick={() => onSupprimer(it.id)}
                  aria-label="Supprimer"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={3} className="vide">
                Aucune ligne.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="form-inline">
        <button type="button" className="btn" onClick={onAjouter}>
          + Ligne
        </button>
        <button type="button" className="btn" onClick={onCopierPrecedent}>
          Reprendre le mois précédent
        </button>
      </div>
    </div>
  );
}
