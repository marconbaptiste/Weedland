import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

// Guide de démarrage : checklist des premières étapes, cochée automatiquement
// selon ce qui a déjà été fait. Contenu adapté au rôle (admin / employé).
// Masquable (mémorisé par compte).
export default function GuideDemarrage() {
  const { utilisateur, estAdmin } = useAuth();
  const cle = `guide-demarrage-masque:${utilisateur?.id}`;
  const [masque, setMasque] = useState(() => localStorage.getItem(cle) === '1');
  const [etat, setEtat] = useState({});

  useEffect(() => {
    if (masque || !utilisateur?.id) return;
    const compter = (table, filtre) => {
      let q = supabase.from(table).select('id', { count: 'exact', head: true });
      if (filtre) q = q.eq('employe_id', utilisateur.id);
      return q.then(({ count }) => count ?? 0);
    };
    if (estAdmin) {
      Promise.all([compter('stocks'), compter('users'), compter('clients'), compter('caisse_jour')]).then(
        ([produits, employes, clients, clotures]) =>
          setEtat({ produits, employes, clients, clotures }),
      );
    } else {
      Promise.all([compter('caisse_jour', true), compter('chromes', true)]).then(
        ([clotures, chromes]) => setEtat({ clotures, chromes }),
      );
    }
  }, [estAdmin, masque, utilisateur?.id]);

  if (masque) return null;

  const etapes = estAdmin
    ? [
        { ok: etat.produits > 0, texte: 'Ajoute tes produits en stock', lien: '/stocks', libLien: 'Stocks' },
        { ok: etat.employes > 1, texte: 'Crée les comptes de tes employés', lien: '/comptes', libLien: 'Comptes' },
        { ok: etat.clients > 0, texte: 'Enregistre tes premiers clients', lien: '/chromes', libLien: 'Clients' },
        { ok: etat.clotures > 0, texte: 'Fais ta première clôture de caisse', lien: '/caisse/cloture', libLien: 'Clôture' },
      ]
    : [
        { ok: etat.clotures > 0, texte: 'Fais ta première clôture de caisse', lien: '/caisse/cloture', libLien: 'Clôture' },
        { ok: etat.chromes > 0, texte: 'Enregistre une avance ou un remboursement client', lien: '/chromes', libLien: 'Clients' },
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
      <p className="statut">
        {estAdmin
          ? 'Quelques étapes pour bien démarrer ta boutique :'
          : 'Bienvenue ! Voici par où commencer :'}
      </p>
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
      {!estAdmin && (
        <p className="statut">
          Astuce : retrouve tes ventes passées dans <strong>Historique</strong> et l’inventaire dans{' '}
          <strong>Stocks</strong>.
        </p>
      )}
    </div>
  );
}
