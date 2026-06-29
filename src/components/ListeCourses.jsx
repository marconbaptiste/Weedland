import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Liste de courses partagée du magasin (to-do d'achats) : tout membre ajoute un
// article à acheter, le coche quand c'est fait, ou le retire. La RLS cloisonne
// par magasin (table liste_courses) — pas de sécurité côté front à assurer ici.
export default function ListeCourses() {
  const [articles, setArticles] = useState([]);
  const [nouveau, setNouveau] = useState('');
  const [ouvert, setOuvert] = useState(false);

  const charger = useCallback(async () => {
    const { data } = await supabase
      .from('liste_courses')
      .select('id, libelle, fait')
      .order('fait', { ascending: true })
      .order('created_at', { ascending: true });
    setArticles(data ?? []);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function ajouter(e) {
    e.preventDefault();
    const libelle = nouveau.trim();
    if (!libelle) return;
    // Insertion optimiste pour une saisie rapide au comptoir.
    setNouveau('');
    const { error } = await supabase.from('liste_courses').insert({ libelle });
    if (!error) charger();
  }

  async function basculer(a) {
    const { error } = await supabase
      .from('liste_courses')
      .update({ fait: !a.fait })
      .eq('id', a.id);
    if (!error) charger();
  }

  async function retirer(id) {
    await supabase.from('liste_courses').delete().eq('id', id);
    charger();
  }

  async function viderAchetes() {
    const faits = articles.filter((a) => a.fait).map((a) => a.id);
    if (faits.length === 0) return;
    if (!window.confirm('Retirer tous les articles déjà achetés ?')) return;
    await supabase.from('liste_courses').delete().in('id', faits);
    charger();
  }

  const aFaire = articles.filter((a) => !a.fait).length;
  const nbAchetes = articles.length - aFaire;

  return (
    <div className="card">
      <button
        type="button"
        className="courses-tete"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
      >
        <h2>🛒 Liste de courses</h2>
        <span className="courses-compteur">
          {aFaire > 0 ? `${aFaire} à acheter` : 'à jour'} {ouvert ? '▲' : '▼'}
        </span>
      </button>

      {ouvert && (
        <>
          <form className="form-inline" onSubmit={ajouter}>
            <input
              type="text"
              placeholder="Ajouter un article à acheter…"
              value={nouveau}
              onChange={(e) => setNouveau(e.target.value)}
              maxLength={120}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" type="submit">
              Ajouter
            </button>
          </form>

          {articles.length === 0 ? (
            <p className="vide">Rien à acheter pour le moment.</p>
          ) : (
            <ul className="courses-liste">
              {articles.map((a) => (
                <li key={a.id} className={`courses-item ${a.fait ? 'fait' : ''}`}>
                  <label className="courses-label">
                    <input type="checkbox" checked={a.fait} onChange={() => basculer(a)} />
                    <span>{a.libelle}</span>
                  </label>
                  <button
                    type="button"
                    className="btn btn-discret"
                    onClick={() => retirer(a.id)}
                    aria-label="Retirer l’article"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {nbAchetes > 0 && (
            <button type="button" className="btn btn-discret" onClick={viderAchetes}>
              Retirer les {nbAchetes} article{nbAchetes > 1 ? 's' : ''} acheté{nbAchetes > 1 ? 's' : ''}
            </button>
          )}
        </>
      )}
    </div>
  );
}
