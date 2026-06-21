import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

// Guide de démarrage (admins) : checklist des premières étapes, cochée
// automatiquement selon ce qui a déjà été fait. Masquable (mémorisé par compte).
export default function GuideDemarrage() {
  const { utilisateur, estAdmin } = useAuth();
  const cle = `guide-demarrage-masque:${utilisateur?.id}`;
  const [masque, setMasque] = useState(() => localStorage.getItem(cle) === '1');
  const [etat, setEtat] = useState({ produits: 0, employes: 0, clients: 0, clotures: 0 });

  useEffect(() => {
    if (!estAdmin || masque) return;
    const compter = (table) =>
      supabase.from(table).select('id', { count: 'exact', head: true }).then(({ count }) => count ?? 0);
    Promise.all([compter('stocks'), compter('users'), compter('clients'), compter('caisse_jour')]).then(
      ([produits, employes, clients, clotures]) =>
        setEtat({ produits, employes, clients, clotures }),
    );
  }, [estAdmin, masque]);

  if (!estAdmin || masque) return null;

  const etapes = [
    { ok: etat.produits > 0, texte: 'Ajoute tes produits en stock', lien: '/stocks', libLien: 'Stocks' },
    { ok: etat.employes > 1, texte: 'Crée les comptes de tes employés', lien: '/comptes', libLien: 'Comptes' },
    { ok: etat.clients > 0, texte: 'Enregistre tes premiers clients (chromes)', lien: '/chromes', libLien: 'Chromes' },
    { ok: etat.clotures > 0, texte: 'Fais ta première clôture de caisse', lien: '/', libLien: 'Caisse' },
  ];
  const faites = etapes.filter((e) => e.ok).length;
  const toutFait = faites === etapes.length;

  function masquer() {
    localStorage.setItem(cle, '1');
    setMasque(true);
  }

  return (
    <div className="card guide">
      <div className="histo-tete">
        <strong>🚀 Premiers pas {toutFait ? '— tout est prêt ! 🎉' : `(${faites}/${etapes.length})`}</strong>
        <button type="button" className="btn btn-discret" onClick={masquer}>
          Masquer
        </button>
      </div>
      <p className="statut">Quelques étapes pour bien démarrer ta boutique :</p>
      <ul className="guide-liste">
        {etapes.map((e) => (
          <li key={e.texte} className={`guide-item ${e.ok ? 'fait' : ''}`}>
            <span className="guide-check" aria-hidden="true">{e.ok ? '✓' : '○'}</span>
            <span className="guide-texte">{e.texte}</span>
            {!e.ok && (
              <Link to={e.lien} className="btn btn-discret">
                {e.libLien}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
