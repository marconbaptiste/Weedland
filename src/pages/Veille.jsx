import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { formatDateFr } from '../lib/format';

// Page — Veille réglementaire CBD (bulletin généré automatiquement par l'IA à
// partir de flux d'actualités). Informations INDICATIVES : bandeau permanent +
// lien source sous chaque point. Lecture pour tous les membres ; génération
// manuelle réservée à l'admin (l'automatique passe par une tâche planifiée).
const CATEGORIES = {
  interdit: { emoji: '🔴', libelle: 'Devient interdit / restreint', classe: 'veille-interdit' },
  autorise: { emoji: '🟢', libelle: 'Autorisé / opportunité', classe: 'veille-autorise' },
  a_suivre: { emoji: '🟡', libelle: 'À suivre', classe: 'veille-suivre' },
  produit: { emoji: '🆕', libelle: 'Nouveau produit / tendance', classe: 'veille-produit' },
  fournisseur: { emoji: '🏭', libelle: 'Fournisseur / appro', classe: 'veille-fournisseur' },
};

export default function Veille() {
  const { estAdmin } = useAuth();
  const [bulletin, setBulletin] = useState(null);
  const [charge, setCharge] = useState(false);
  const [gen, setGen] = useState(false);
  const [msg, setMsg] = useState('');

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('veille')
      .select('id, created_at, titre, intro, items')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setBulletin(data ?? null);
    setCharge(true);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function genererMaintenant() {
    setGen(true);
    setMsg('');
    const { data, error } = await supabase.functions.invoke('veille-cbd', { body: {} });
    setGen(false);
    if (error || data?.error) {
      let m = data?.error ?? 'Génération impossible pour le moment.';
      try {
        const corps = await error?.context?.json();
        if (corps?.error) m = corps.error;
      } catch {
        /* message générique */
      }
      setMsg(m);
      return;
    }
    setMsg(`Bulletin mis à jour ✅ (${data?.nb ?? 0} info(s)).`);
    charger();
  }

  const items = bulletin?.items ?? [];

  return (
    <div className="page">
      <div className="entete-client">
        <h1>📰 Veille réglementaire</h1>
        {estAdmin && (
          <button type="button" className="btn btn-compact" onClick={genererMaintenant} disabled={gen}>
            {gen ? 'Recherche…' : '🔄 Générer maintenant'}
          </button>
        )}
      </div>

      <p className="veille-avertissement">
        ⚠️ <strong>Informations indicatives</strong>, générées automatiquement à partir d’actualités
        publiques (légal, nouveaux produits, fournisseurs). Elles <strong>ne remplacent pas les
        textes officiels</strong> ni un conseil juridique, et les fournisseurs cités ne sont{' '}
        <strong>pas des recommandations</strong> — vérifie toujours la source avant toute décision.
      </p>

      {msg && <p className="statut">{msg}</p>}

      {!charge ? (
        <p className="statut">Chargement…</p>
      ) : !bulletin ? (
        <div className="card">
          <p className="vide">Pas encore de bulletin.</p>
          <p className="statut">
            {estAdmin
              ? 'Clique sur « Générer maintenant » (nécessite la clé IA côté serveur), ou attends la génération automatique hebdomadaire.'
              : 'Le premier bulletin arrivera bientôt.'}
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="histo-tete">
            <strong>{bulletin.titre}</strong>
            <span className="chrome-heure">{formatDateFr(bulletin.created_at)}</span>
          </div>
          {bulletin.intro && <p className="veille-intro">{bulletin.intro}</p>}

          {items.length === 0 ? (
            <p className="vide">Rien de notable sur cette période.</p>
          ) : (
            <ul className="veille-liste">
              {items.map((it, i) => {
                const cat = CATEGORIES[it.categorie] ?? CATEGORIES.a_suivre;
                return (
                  <li key={i} className={`veille-item ${cat.classe}`}>
                    <span className="veille-cat">
                      {cat.emoji} {cat.libelle}
                    </span>
                    <p className="veille-texte">{it.texte}</p>
                    {it.source_url && (
                      <a href={it.source_url} target="_blank" rel="noopener noreferrer" className="veille-source">
                        🔗 {it.source_nom || 'Lire la source'}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
