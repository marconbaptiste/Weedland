import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import Messagerie from '../components/Messagerie';

// Mode pilote (super-admin) — panneau d'accueil : on choisit un magasin à
// piloter. Chaque carte porte un indicateur de messages (cliquable pour
// répondre sans entrer). Cliquer la carte ouvre le magasin avec tous les outils.
const LIBELLE_ABO = { essai: 'Essai', actif: 'Actif', suspendu: 'Suspendu' };

export default function Pilote() {
  const { utilisateur, magasinId, deconnexion } = useAuth();
  const [magasins, setMagasins] = useState([]);
  const [nonLus, setNonLus] = useState({}); // magasin_id -> nb messages non lus
  const [fil, setFil] = useState(null); // { id, nom } magasin de la messagerie ouverte

  const charger = useCallback(async () => {
    const [{ data: mg }, { data: msg }] = await Promise.all([
      supabase.from('magasins').select('id, nom, abonnement, essai_fin').order('nom'),
      supabase.from('messages').select('magasin_id, de_superadmin, lu'),
    ]);
    setMagasins(mg ?? []);
    const compte = {};
    (msg ?? [])
      .filter((m) => !m.lu && !m.de_superadmin)
      .forEach((m) => {
        compte[m.magasin_id] = (compte[m.magasin_id] ?? 0) + 1;
      });
    setNonLus(compte);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  // Entrer dans un magasin : on bascule le magasin actif puis on ouvre l'app.
  async function entrer(m) {
    if (!utilisateur) return;
    await supabase.from('users').update({ magasin_id: m.id }).eq('id', utilisateur.id);
    sessionStorage.setItem('pilote:entre', '1');
    window.location.href = '/';
  }

  function fermerFil() {
    setFil(null);
    charger(); // rafraîchit les compteurs (messages marqués lus à l'ouverture)
  }

  return (
    <div className="page-connexion pilote">
      <div className="pilote-tete">
        <span className="logo">Gestion</span>
        <h1 className="logo-connexion">🧭 Mode pilote</h1>
        <p className="statut">Choisis un magasin à piloter.</p>
      </div>

      <div className="pilote-grille">
        {magasins.map((m) => (
          <div key={m.id} className="pilote-carte">
            <button type="button" className="pilote-carte-corps" onClick={() => entrer(m)}>
              <strong>{m.nom}</strong>
              <span className={`badge ${m.abonnement === 'suspendu' ? 'badge-dette' : 'badge-solde'}`}>
                {LIBELLE_ABO[m.abonnement] ?? m.abonnement}
                {m.id === magasinId ? ' · actuel' : ''}
              </span>
            </button>
            <button
              type="button"
              className={`pilote-msg ${nonLus[m.id] ? 'a-message' : ''}`}
              onClick={() => setFil({ id: m.id, nom: m.nom })}
              title="Messages du magasin"
            >
              💬{nonLus[m.id] ? ` ${nonLus[m.id]}` : ''}
            </button>
          </div>
        ))}
        {magasins.length === 0 && <p className="vide">Aucun magasin.</p>}
      </div>

      <div className="form-inline" style={{ justifyContent: 'center' }}>
        <Link to="/magasins" className="btn">
          ⚙️ Gestion avancée
        </Link>
        <button type="button" className="btn btn-discret" onClick={deconnexion}>
          Déconnexion
        </button>
      </div>

      {fil && (
        <div className="aide-fond" role="dialog" aria-modal="true" aria-label="Messages magasin" onClick={fermerFil}>
          <div className="aide-modale" onClick={(e) => e.stopPropagation()}>
            <div className="aide-tete">
              <h2>💬 {fil.nom}</h2>
              <button type="button" className="btn btn-discret" onClick={fermerFil}>
                Fermer
              </button>
            </div>
            <Messagerie magasinId={fil.id} superadmin />
          </div>
        </div>
      )}
    </div>
  );
}
