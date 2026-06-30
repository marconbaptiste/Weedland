import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { formatEuros } from '../lib/format';
import { aujourdhuiISO, intervallePeriode, intervalleAnnee } from '../lib/dates';
import { somme } from '../lib/comptabilite';
import GuideDemarrage from '../components/GuideDemarrage';
import CalculatriceMonnaie from '../components/CalculatriceMonnaie';
import ScannerFidelite from '../components/ScannerFidelite';
import ListeCourses from '../components/ListeCourses';

// Accueil après connexion : profil + CA (jour/semaine) + une rangée de
// raccourcis en bulles (scanner fidélité, liste de courses, rendu monnaie). La
// bulle « courses » porte une pastille de notification. Le détail des chromes du
// jour vit désormais sur la page Clients.
export default function Profil() {
  const { utilisateur, profil, estAdmin } = useAuth();
  const [stats, setStats] = useState({ caJour: 0, caSemaine: 0 });
  const [statsPerso, setStatsPerso] = useState({ caMois: 0, intMois: 0, caAnnee: 0, intAnnee: 0 });
  const [outil, setOutil] = useState(null); // 'monnaie' | 'scanner' | 'courses' | null
  const [nbCourses, setNbCourses] = useState(0);
  const [coursesNouveau, setCoursesNouveau] = useState(false);
  const vusRef = useRef(null); // nb d'articles « déjà vus » (référence notif)
  const coursesOuvertRef = useRef(false);

  useEffect(() => {
    const today = aujourdhuiISO();
    const [deb, fin] = intervallePeriode('semaine');
    (async () => {
      const [{ data: cl }, { data: chr }] = await Promise.all([
        supabase.from('v_ca_jour').select('date, encaissements').eq('employe_id', utilisateur.id).gte('date', deb).lte('date', fin),
        supabase.from('chromes').select('date, type, montant, clients(surnom)').eq('employe_id', utilisateur.id).gte('date', deb).lte('date', fin),
      ]);
      const enc = (d) => somme((cl ?? []).filter((r) => d(r.date)).map((r) => r.encaissements));
      const av = (d) => somme((chr ?? []).filter((c) => c.type === 'avance' && d(c.date)).map((c) => c.montant));
      const rb = (d) => somme((chr ?? []).filter((c) => c.type === 'remboursement' && d(c.date)).map((c) => c.montant));
      const jour = (x) => x === today;
      const tout = () => true;
      setStats({
        caJour: somme([enc(jour), av(jour), -rb(jour)]),
        caSemaine: somme([enc(tout), av(tout), -rb(tout)]),
      });
    })();
  }, [utilisateur.id]);

  // Récap personnel : CA + intéressement du mois et de l'année (déplacé depuis
  // la page Caisse).
  useEffect(() => {
    (async () => {
      const [aDeb, aFin] = intervalleAnnee();
      const [mDeb, mFin] = intervallePeriode('mois');
      const { data } = await supabase
        .from('v_interessement_employe')
        .select('date, est_proprietaire, ca_jour, interessement')
        .eq('employe_id', utilisateur.id)
        .gte('date', aDeb)
        .lte('date', aFin);
      const lignes = data ?? [];
      const dansMois = (d) => d >= mDeb && d <= mFin;
      setStatsPerso({
        caMois: somme(lignes.filter((l) => l.est_proprietaire && dansMois(l.date)).map((l) => l.ca_jour)),
        intMois: somme(lignes.filter((l) => dansMois(l.date)).map((l) => l.interessement)),
        caAnnee: somme(lignes.filter((l) => l.est_proprietaire).map((l) => l.ca_jour)),
        intAnnee: somme(lignes.map((l) => l.interessement)),
      });
    })();
  }, [utilisateur.id]);

  // Compteur de la liste de courses + notification quand un collègue ajoute.
  const chargerCourses = useCallback(async () => {
    const { count } = await supabase
      .from('liste_courses')
      .select('id', { count: 'exact', head: true })
      .eq('fait', false);
    const n = count ?? 0;
    setNbCourses(n);
    if (vusRef.current === null) {
      vusRef.current = n;
    } else if (n > vusRef.current && !coursesOuvertRef.current) {
      setCoursesNouveau(true);
    } else if (n < vusRef.current) {
      vusRef.current = n;
    }
  }, []);

  useEffect(() => {
    chargerCourses();
    const surVisible = () => {
      if (!document.hidden) chargerCourses();
    };
    document.addEventListener('visibilitychange', surVisible);
    window.addEventListener('focus', chargerCourses);
    const it = setInterval(() => {
      if (!document.hidden) chargerCourses();
    }, 20000);
    return () => {
      document.removeEventListener('visibilitychange', surVisible);
      window.removeEventListener('focus', chargerCourses);
      clearInterval(it);
    };
  }, [chargerCourses]);

  function ouvrirCourses() {
    setOutil('courses');
    coursesOuvertRef.current = true;
    vusRef.current = nbCourses;
    setCoursesNouveau(false);
  }

  function fermerOutil() {
    if (outil === 'courses') {
      coursesOuvertRef.current = false;
      chargerCourses();
    }
    setOutil(null);
  }

  const prenom = (profil?.nom ?? '').split(' ')[0];

  return (
    <div className="page">
      <h1>Bonjour {prenom} 👋</h1>

      <div className="cartes-kpi">
        <div className="kpi">
          <span className="kpi-label">CA du jour</span>
          <span className="kpi-valeur">{formatEuros(stats.caJour)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">CA de la semaine</span>
          <span className="kpi-valeur">{formatEuros(stats.caSemaine)}</span>
        </div>
      </div>

      <div className="card">
        <div className="histo-tete">
          <strong>{profil?.nom}</strong>
          <span className="badge badge-solde">{estAdmin ? 'Admin' : 'Employé'}</span>
        </div>
        <div className="cartes-kpi">
          <div className="kpi">
            <span className="kpi-label">CA du mois</span>
            <span className="kpi-valeur">{formatEuros(statsPerso.caMois)}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Intéressement du mois</span>
            <span className="kpi-valeur">{formatEuros(statsPerso.intMois)}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">CA de l’année</span>
            <span className="kpi-valeur">{formatEuros(statsPerso.caAnnee)}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Intéressement de l’année</span>
            <span className="kpi-valeur">{formatEuros(statsPerso.intAnnee)}</span>
          </div>
        </div>
      </div>

      <div className="bulles-accueil">
        <button type="button" className="bulle-raccourci" onClick={() => setOutil('scanner')}>
          <span className="bulle-rond">🎟️</span>
          <span className="bulle-label">Scanner fidélité</span>
        </button>
        <button type="button" className="bulle-raccourci" onClick={ouvrirCourses}>
          <span className="bulle-rond">
            🛒
            {nbCourses > 0 && (
              <span className={`fab-badge ${coursesNouveau ? 'nouveau' : ''}`}>{nbCourses}</span>
            )}
          </span>
          <span className="bulle-label">Liste de courses</span>
        </button>
        <button type="button" className="bulle-raccourci" onClick={() => setOutil('monnaie')}>
          <span className="bulle-rond">💶</span>
          <span className="bulle-label">Rendu de monnaie</span>
        </button>
      </div>

      <GuideDemarrage />

      {outil === 'monnaie' && (
        <div className="aide-fond" role="dialog" aria-modal="true" onClick={fermerOutil}>
          <div className="aide-modale" onClick={(e) => e.stopPropagation()}>
            <div className="aide-tete">
              <h2>💶 Rendu de monnaie</h2>
              <button type="button" className="btn btn-discret" onClick={fermerOutil}>
                Fermer
              </button>
            </div>
            <CalculatriceMonnaie />
          </div>
        </div>
      )}
      {outil === 'courses' && (
        <div className="aide-fond" role="dialog" aria-modal="true" aria-label="Liste de courses" onClick={fermerOutil}>
          <div className="aide-modale" onClick={(e) => e.stopPropagation()}>
            <div className="aide-tete">
              <h2>🛒 Liste de courses</h2>
              <button type="button" className="btn btn-discret" onClick={fermerOutil}>
                Fermer
              </button>
            </div>
            <ListeCourses embarque onMaj={chargerCourses} />
          </div>
        </div>
      )}
      {outil === 'scanner' && <ScannerFidelite onClose={fermerOutil} />}

      {estAdmin && (
        <p className="periode-info">Tu es administrateur — retrouve la vue consolidée dans le Dashboard.</p>
      )}
    </div>
  );
}
