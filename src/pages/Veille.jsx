import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { formatDateFr } from '../lib/format';

// Page — News CBD (bulletin généré automatiquement par l'IA : flux d'actualités
// + recherche web active). Informations INDICATIVES : bandeau permanent + lien
// source sous chaque point. Lecture pour tous les membres ; génération manuelle
// réservée à l'admin (l'automatique passe par une tâche planifiée).
//
// Mise en page : on affiche 3 SYNTHÈSES courtes écrites par l'IA (synthèse du
// jour + nouveautés produits/fournisseurs + réglementation), et le DÉTAIL des
// articles (avec sources) est caché dans des tiroirs par section. Gain de place.
const CATEGORIES = {
  interdit: { emoji: '🔴', libelle: 'Devient interdit / restreint', classe: 'veille-interdit' },
  autorise: { emoji: '🟢', libelle: 'Autorisé / opportunité', classe: 'veille-autorise' },
  a_suivre: { emoji: '🟡', libelle: 'À suivre', classe: 'veille-suivre' },
  produit: { emoji: '🆕', libelle: 'Nouveau produit / tendance', classe: 'veille-produit' },
  fournisseur: { emoji: '🏭', libelle: 'Fournisseur / appro', classe: 'veille-fournisseur' },
  opportunite: { emoji: '💡', libelle: 'Opportunité — à ajouter au catalogue', classe: 'veille-opportunite' },
};

const PROD = ['produit', 'fournisseur', 'opportunite']; // nouveautés commerciales
const REGL = ['interdit', 'autorise', 'a_suivre']; // réglementaire / légal
const COLS = 'id, created_at, titre, intro, synthese_produits, synthese_reglementation, items, magasin_id';

function ItemLi({ it }) {
  const cat = CATEGORIES[it.categorie] ?? CATEGORIES.a_suivre;
  return (
    <li className={`veille-item ${cat.classe}`}>
      <div className="veille-item-tete">
        <span className="veille-cat">
          {cat.emoji} {cat.libelle}
        </span>
        {it.date && <span className="veille-date">🗓️ {formatDateFr(it.date)}</span>}
      </div>
      <p className="veille-texte">{it.texte}</p>
      {it.source_url && (
        <a href={it.source_url} target="_blank" rel="noopener noreferrer" className="veille-source">
          🔗 {it.source_nom || 'Lire la source'}
        </a>
      )}
    </li>
  );
}

// Une section = un titre + la synthèse IA (visible) + un tiroir qui déplie le
// détail des articles/sources. Rien à afficher si aucune synthèse ni article.
function SectionTiroir({ titre, synthese, items, ouvert, onToggle, videTexte }) {
  if (!synthese && items.length === 0) {
    return videTexte ? (
      <>
        <h3 className="veille-section-titre">{titre}</h3>
        <p className="statut">{videTexte}</p>
      </>
    ) : null;
  }
  return (
    <>
      <h3 className="veille-section-titre">{titre}</h3>
      {synthese && <p className="veille-synthese">{synthese}</p>}
      {items.length > 0 && (
        <>
          <button type="button" className="veille-tiroir" onClick={onToggle} aria-expanded={ouvert}>
            📂 {ouvert ? 'Masquer' : 'Voir'} le détail — {items.length} article
            {items.length > 1 ? 's' : ''} &amp; source{items.length > 1 ? 's' : ''}{' '}
            <span className="chevron">{ouvert ? '▾' : '▸'}</span>
          </button>
          {ouvert && (
            <ul className="veille-liste">
              {items.map((it, i) => (
                <ItemLi key={i} it={it} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

export default function Veille() {
  const { estAdmin } = useAuth();
  const [bulletin, setBulletin] = useState(null);
  const [charge, setCharge] = useState(false);
  const [gen, setGen] = useState(false);
  const [msg, setMsg] = useState('');
  const [avertOuvert, setAvertOuvert] = useState(false); // bandeau « indicatif » replié
  const [prodOuvert, setProdOuvert] = useState(false); // tiroir nouveautés produits
  const [reglOuvert, setReglOuvert] = useState(false); // tiroir réglementation
  const monteRef = useRef(true); // évite les setState après démontage
  const pollRef = useRef(null); // id du timer de surveillance

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('veille')
      .select(COLS)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!monteRef.current) return null;
    setBulletin(data ?? null);
    setCharge(true);
    return data ?? null;
  }, []);

  useEffect(() => {
    monteRef.current = true;
    charger();
    return () => {
      monteRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [charger]);

  // La génération tourne EN TÂCHE DE FOND côté serveur (elle continue même si on
  // ferme l'app). On surveille l'arrivée d'un bulletin plus récent que celui
  // affiché avant le clic, puis on l'affiche automatiquement.
  const surveiller = useCallback(
    (avantId, essai = 0) => {
      const MAX = 24; // ~4 min à 10 s
      pollRef.current = setTimeout(async () => {
        if (!monteRef.current) return;
        const { data } = await supabase
          .from('veille')
          .select(COLS)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!monteRef.current) return;
        if (data && data.id !== avantId) {
          setBulletin(data);
          setGen(false);
          setMsg(`Bulletin mis à jour ✅ (${(data.items ?? []).length} info(s)).`);
          return;
        }
        if (essai >= MAX) {
          setGen(false);
          setMsg(
            "La recherche prend plus de temps que prévu, ou rien de neuf n'est ressorti. " +
              'Le bulletin s’affichera ici dès qu’il est prêt — reviens dans un moment ou réessaie.'
          );
          return;
        }
        surveiller(avantId, essai + 1);
      }, 10000);
    },
    []
  );

  async function genererMaintenant() {
    if (pollRef.current) clearTimeout(pollRef.current);
    setGen(true);
    setMsg('');
    const avantId = bulletin?.id ?? null;
    const { data, error } = await supabase.functions.invoke('veille-cbd', { body: {} });
    // Erreur immédiate (non autorisé, clé IA manquante…) → on s'arrête là.
    if (error || data?.error) {
      let m = data?.error ?? 'Génération impossible pour le moment.';
      try {
        const corps = await error?.context?.json();
        if (corps?.error) m = corps.error;
      } catch {
        /* message générique */
      }
      setGen(false);
      setMsg(m);
      return;
    }
    // La recherche est lancée côté serveur : on surveille son résultat.
    setMsg(
      '🔎 Recherche en cours… Ça peut prendre 1 à 2 minutes. Tu peux fermer l’app : ' +
        'le bulletin s’affichera ici dès qu’il est prêt.'
    );
    surveiller(avantId);
  }

  const items = bulletin?.items ?? [];
  const parDate = (a, b) => (b.date || '').localeCompare(a.date || '');
  const itemsProd = items.filter((i) => PROD.includes(i.categorie)).sort(parDate);
  const itemsRegl = items.filter((i) => REGL.includes(i.categorie)).sort(parDate);

  return (
    <div className="page">
      <div className="entete-client">
        <h1>📰 News</h1>
        {estAdmin && (
          <button type="button" className="btn btn-compact" onClick={genererMaintenant} disabled={gen}>
            {gen ? (
              <>
                <span className="spinner-inline" aria-hidden="true" /> Recherche…
              </>
            ) : (
              '🔄 Générer maintenant'
            )}
          </button>
        )}
      </div>

      <button
        type="button"
        className="veille-avertissement veille-avert-btn"
        onClick={() => setAvertOuvert((o) => !o)}
        aria-expanded={avertOuvert}
      >
        {avertOuvert ? (
          <span>
            ⚠️ <strong>Informations indicatives</strong>, générées automatiquement à partir
            d’actualités publiques (légal, nouveaux produits, fournisseurs). Elles{' '}
            <strong>ne remplacent pas les textes officiels</strong> ni un conseil juridique, et les
            fournisseurs cités ne sont <strong>pas des recommandations</strong> — vérifie toujours la
            source avant toute décision. <span className="chevron">▾</span>
          </span>
        ) : (
          <span>
            ⚠️ <strong>Informations indicatives</strong> <span className="chevron">▸</span>
          </span>
        )}
      </button>

      {gen && (
        <div className="veille-recherche">
          <span className="spinner-inline spinner-lg" aria-hidden="true" />
          <span>Recherche en cours…</span>
        </div>
      )}
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
          {bulletin.magasin_id && (
            <p className="statut">
              🎯 Ciblé sur les produits de ta boutique. Les <strong>💡 Opportunités</strong> sont des
              suggestions de produits qui ressortent dans l’actu et que tu ne vends pas encore
              (indicatif, pas une garantie de vente).
            </p>
          )}
          {/* Synthèse du jour (toujours visible) */}
          {bulletin.intro && <p className="veille-intro">{bulletin.intro}</p>}

          {items.length === 0 && !bulletin.synthese_produits && !bulletin.synthese_reglementation ? (
            <p className="vide">Rien de notable sur cette période.</p>
          ) : (
            <>
              {/* Nouveautés produits & fournisseurs : synthèse + tiroir de détail */}
              <SectionTiroir
                titre="🆕 Nouveautés, produits & fournisseurs"
                synthese={bulletin.synthese_produits}
                items={itemsProd}
                ouvert={prodOuvert}
                onToggle={() => setProdOuvert((o) => !o)}
                videTexte={
                  !bulletin.synthese_produits && itemsProd.length === 0
                    ? 'Pas de nouveauté produit repérée ce coup-ci — l’IA scrute les lancements de marques, goûts et gammes fournisseurs.'
                    : null
                }
              />

              {/* Réglementation & légal : synthèse + tiroir de détail */}
              <SectionTiroir
                titre="⚖️ Réglementation & légal"
                synthese={bulletin.synthese_reglementation}
                items={itemsRegl}
                ouvert={reglOuvert}
                onToggle={() => setReglOuvert((o) => !o)}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
