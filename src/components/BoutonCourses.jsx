import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import ListeCourses from './ListeCourses';

// Raccourci flottant (présent sur toutes les pages, au-dessus du bouton « rendu
// monnaie ») ouvrant la liste de courses partagée. Une pastille affiche le
// nombre d'articles à acheter et PULSE quand un nouvel article apparaît (ajouté
// par un collègue) depuis la dernière fois que la liste a été ouverte.
export default function BoutonCourses() {
  const [ouvert, setOuvert] = useState(false);
  const [nb, setNb] = useState(0);
  const [nouveau, setNouveau] = useState(false);
  const vusRef = useRef(null); // nb d'articles « déjà vus » (référence pour la notif)
  const ouvertRef = useRef(false);

  const charger = useCallback(async () => {
    const { count } = await supabase
      .from('liste_courses')
      .select('id', { count: 'exact', head: true })
      .eq('fait', false);
    const n = count ?? 0;
    setNb(n);
    if (vusRef.current === null) {
      vusRef.current = n; // première mesure : pas de notification.
    } else if (n > vusRef.current && !ouvertRef.current) {
      setNouveau(true); // quelqu'un a ajouté un article.
    } else if (n < vusRef.current) {
      vusRef.current = n; // des articles ont été achetés/retirés : on rebase.
    }
  }, []);

  // Rafraîchit à l'ouverture de l'app, au retour sur l'onglet, et toutes les 20 s.
  useEffect(() => {
    charger();
    const surVisible = () => {
      if (!document.hidden) charger();
    };
    document.addEventListener('visibilitychange', surVisible);
    window.addEventListener('focus', charger);
    const it = setInterval(() => {
      if (!document.hidden) charger();
    }, 20000);
    return () => {
      document.removeEventListener('visibilitychange', surVisible);
      window.removeEventListener('focus', charger);
      clearInterval(it);
    };
  }, [charger]);

  // Échap ferme la modale.
  useEffect(() => {
    if (!ouvert) return undefined;
    const surTouche = (e) => {
      if (e.key === 'Escape') fermer();
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [ouvert]);

  function ouvrir() {
    setOuvert(true);
    ouvertRef.current = true;
    vusRef.current = nb; // ce qui est affiché est désormais « vu ».
    setNouveau(false);
  }

  function fermer() {
    setOuvert(false);
    ouvertRef.current = false;
    charger(); // resynchronise le compteur après d'éventuelles modifications.
  }

  return (
    <>
      <button
        type="button"
        className="fab-courses"
        onClick={ouvrir}
        aria-label="Liste de courses"
        title="Liste de courses"
      >
        🛒
        {nb > 0 && <span className={`fab-badge ${nouveau ? 'nouveau' : ''}`}>{nb}</span>}
      </button>

      {ouvert && (
        <div
          className="aide-fond"
          role="dialog"
          aria-modal="true"
          aria-label="Liste de courses"
          onClick={fermer}
        >
          <div className="aide-modale" onClick={(e) => e.stopPropagation()}>
            <div className="aide-tete">
              <h2>🛒 Liste de courses</h2>
              <button type="button" className="btn btn-discret" onClick={fermer}>
                Fermer
              </button>
            </div>
            <ListeCourses embarque onMaj={charger} />
          </div>
        </div>
      )}
    </>
  );
}
