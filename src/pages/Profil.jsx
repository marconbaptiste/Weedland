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
import CalendrierLecture from '../components/CalendrierLecture';

// Accueil après connexion : profil + CA (jour/semaine) + une rangée de
// raccourcis en bulles (scanner fidélité, liste de courses, rendu monnaie). La
// bulle « courses » porte une pastille de notification. Le détail des chromes du
// jour vit désormais sur la page Clients.
export default function Profil() {
  const { utilisateur, profil, estAdmin, options } = useAuth();
  const aInteressement = (profil?.pourcentage_interessement ?? 0) > 0;
  const [stats, setStats] = useState({ caJour: 0 });
  const [statsPerso, setStatsPerso] = useState({ intMois: 0, intAnnee: 0 });
  const [chromesJour, setChromesJour] = useState([]); // chromes du jour du magasin (tout le monde)
  const [outil, setOutil] = useState(null); // 'monnaie' | 'scanner' | 'courses' | null
  const [nbCourses, setNbCourses] = useState(0);
  const [coursesNouveau, setCoursesNouveau] = useState(false);
  const vusRef = useRef(null); // nb d'articles « déjà vus » (référence notif)
  const coursesOuvertRef = useRef(false);

  // CA du jour de l'employé connecté (encaissements + avances − remboursements).
  useEffect(() => {
    const today = aujourdhuiISO();
    (async () => {
      const [{ data: cl }, { data: chr }] = await Promise.all([
        supabase.from('v_ca_jour').select('encaissements').eq('employe_id', utilisateur.id).eq('date', today),
        supabase.from('chromes').select('type, montant').eq('employe_id', utilisateur.id).eq('date', today),
      ]);
      const enc = somme((cl ?? []).map((r) => r.encaissements));
      const av = somme((chr ?? []).filter((c) => c.type === 'avance').map((c) => c.montant));
      const rb = somme((chr ?? []).filter((c) => c.type === 'remboursement').map((c) => c.montant));
      setStats({ caJour: somme([enc, av, -rb]) });
    })();
  }, [utilisateur.id]);

  // Intéressement du mois et de l'année (affiché uniquement si l'employé a un taux).
  useEffect(() => {
    if (!aInteressement) return;
    (async () => {
      const [aDeb, aFin] = intervalleAnnee();
      const [mDeb, mFin] = intervallePeriode('mois');
      const { data } = await supabase
        .from('v_interessement_employe')
        .select('date, interessement')
        .eq('employe_id', utilisateur.id)
        .gte('date', aDeb)
        .lte('date', aFin);
      const lignes = data ?? [];
      const dansMois = (d) => d >= mDeb && d <= mFin;
      setStatsPerso({
        intMois: somme(lignes.filter((l) => dansMois(l.date)).map((l) => l.interessement)),
        intAnnee: somme(lignes.map((l) => l.interessement)),
      });
    })();
  }, [utilisateur.id, aInteressement]);

  // Chromes du jour de TOUT le magasin (registre partagé) — visible par tous,
  // employés inclus. Rechargé au retour sur l'onglet/la page.
  useEffect(() => {
    const recharger = () => {
      if (document.hidden) return;
      supabase
        .from('chromes')
        .select('type, montant, created_at, clients(surnom), users(nom)')
        .eq('date', aujourdhuiISO())
        .order('created_at', { ascending: false })
        .then(({ data }) => setChromesJour(data ?? []));
    };
    recharger();
    document.addEventListener('visibilitychange', recharger);
    window.addEventListener('focus', recharger);
    return () => {
      document.removeEventListener('visibilitychange', recharger);
      window.removeEventListener('focus', recharger);
    };
  }, []);

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
  const avancesJour = chromesJour.filter((c) => c.type === 'avance');
  const remboursementsJour = chromesJour.filter((c) => c.type === 'remboursement');

  return (
    <div className="page">
      <h1>Bonjour {prenom} 👋</h1>

      <div className="cartes-kpi">
        <div className="kpi">
          <span className="kpi-label">CA du jour</span>
          <span className="kpi-valeur">{formatEuros(stats.caJour)}</span>
        </div>
      </div>

      {aInteressement && (
        <div className="card">
          <div className="histo-tete">
            <strong>{profil?.nom}</strong>
            <span className="badge badge-solde">{estAdmin ? 'Admin' : 'Employé'}</span>
          </div>
          <div className="cartes-kpi">
            <div className="kpi">
              <span className="kpi-label">Intéressement du mois</span>
              <span className="kpi-valeur">{formatEuros(statsPerso.intMois)}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Intéressement de l’année</span>
              <span className="kpi-valeur">{formatEuros(statsPerso.intAnnee)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Chromes du jour</h2>
        {chromesJour.length === 0 && <p className="vide">Aucun chrome aujourd’hui.</p>}
        {avancesJour.length > 0 && (
          <div className="histo-bloc">
            <span className="histo-titre">Avances</span>
            {avancesJour.map((a, i) => (
              <div key={`a${i}`} className="histo-chrome">
                <span>
                  {a.clients?.surnom ?? 'client'}
                  <span className="chrome-heure"> · {a.users?.nom ?? '—'}</span>
                </span>
                <span className="dette">+ {formatEuros(a.montant)}</span>
              </div>
            ))}
          </div>
        )}
        {remboursementsJour.length > 0 && (
          <div className="histo-bloc">
            <span className="histo-titre">Remboursements</span>
            {remboursementsJour.map((r, i) => (
              <div key={`r${i}`} className="histo-chrome">
                <span>
                  {r.clients?.surnom ?? 'client'}
                  <span className="chrome-heure"> · {r.users?.nom ?? '—'}</span>
                </span>
                <span className="solde-ok">− {formatEuros(r.montant)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bulles-accueil">
        {options.fidelite && (
          <button type="button" className="bulle-raccourci" onClick={() => setOutil('scanner')}>
            <span className="bulle-rond">🎟️</span>
            <span className="bulle-label">Scanner fidélité</span>
          </button>
        )}
        {options.stock && (
          <button type="button" className="bulle-raccourci" onClick={ouvrirCourses}>
            <span className="bulle-rond">
              🛒
              {nbCourses > 0 && (
                <span className={`fab-badge ${coursesNouveau ? 'nouveau' : ''}`}>{nbCourses}</span>
              )}
            </span>
            <span className="bulle-label">Liste de courses</span>
          </button>
        )}
        <button type="button" className="bulle-raccourci" onClick={() => setOutil('monnaie')}>
          <span className="bulle-rond">💶</span>
          <span className="bulle-label">Rendu de monnaie</span>
        </button>
      </div>

      {options.planning && <CalendrierLecture />}

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
        <p className="periode-info">Tu es administrateur — retrouve la vue consolidée dans Comptabilité (menu Gestion).</p>
      )}
    </div>
  );
}
