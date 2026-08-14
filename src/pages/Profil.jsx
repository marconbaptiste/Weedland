import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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
  const { utilisateur, profil, estAdmin, options } = useAuth();
  const aInteressement = (profil?.pourcentage_interessement ?? 0) > 0;
  const [stats, setStats] = useState({ caJour: 0 });
  const [statsPerso, setStatsPerso] = useState({ intMois: 0, intAnnee: 0 });
  const [chromesJour, setChromesJour] = useState([]); // chromes du jour du magasin (tout le monde)
  const [livraisons, setLivraisons] = useState([]); // commandes en cours + celles du jour (suivi)
  const [outil, setOutil] = useState(null); // 'monnaie' | 'scanner' | 'courses' | null
  const [veille, setVeille] = useState(null); // dernier bulletin de veille réglementaire
  const [nbCourses, setNbCourses] = useState(0);
  const [coursesNouveau, setCoursesNouveau] = useState(false);
  const vusRef = useRef(null); // nb d'articles « déjà vus » (référence notif)
  const coursesOuvertRef = useRef(false);
  // Raccourci Livraisons : pastille = nb de commandes en cours, qui pulse quand
  // une NOUVELLE commande apparaît (même mécanisme que la liste de courses).
  const [cmdNouveau, setCmdNouveau] = useState(false);
  const cmdVusRef = useRef(null);
  const cmdOuvertRef = useRef(false);

  // CA du jour de l'employé connecté (encaissements + avances − remboursements).
  useEffect(() => {
    const today = aujourdhuiISO();
    (async () => {
      const [{ data: cl }, { data: chr }] = await Promise.all([
        supabase.from('v_ca_jour').select('ventes_directes').eq('employe_id', utilisateur.id).eq('date', today),
        supabase.from('chromes').select('type, montant').eq('employe_id', utilisateur.id).eq('date', today),
      ]);
      // CA = ventes directes (CB+espèces de la clôture) + avances − remboursements
      // + autres. On somme depuis `chromes` (pas depuis v_ca_jour.encaissements,
      // qui inclut déjà les autres) pour éviter tout double comptage, et pour
      // couvrir aussi les jours SANS clôture.
      const vd = somme((cl ?? []).map((r) => r.ventes_directes));
      const av = somme((chr ?? []).filter((c) => c.type === 'avance').map((c) => c.montant));
      const rb = somme((chr ?? []).filter((c) => c.type === 'remboursement').map((c) => c.montant));
      const vir = somme((chr ?? []).filter((c) => c.type === 'autre').map((c) => c.montant));
      setStats({ caJour: somme([vd, av, vir, -rb]) });
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
      chargerLivraisons();
    };
    recharger();
    document.addEventListener('visibilitychange', recharger);
    window.addEventListener('focus', recharger);
    return () => {
      document.removeEventListener('visibilitychange', recharger);
      window.removeEventListener('focus', recharger);
    };
  }, []);

  // Dernier bulletin de veille réglementaire (aperçu sur l'accueil).
  useEffect(() => {
    supabase
      .from('veille')
      .select('titre, intro, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setVeille(data ?? null));
  }, []);

  // Livraisons : toutes les commandes encore « en cours » (leur note reste
  // affichée tant que pas traitées) + celles du jour déjà traitées/envoyées.
  // Alimente le Suivi du jour ET la pastille du raccourci 🚚 (pulse quand un
  // collègue crée une commande depuis la dernière ouverture du tiroir).
  const chargerLivraisons = useCallback(async () => {
    const { data } = await supabase
      .from('commandes')
      .select('id, montant, payee, statut, note, created_at, clients(surnom)')
      .or(`statut.eq.en_cours,created_at.gte.${aujourdhuiISO()}`)
      .order('created_at', { ascending: true });
    const liste = data ?? [];
    setLivraisons(liste);
    const n = liste.filter((c) => c.statut === 'en_cours').length;
    if (cmdVusRef.current === null) {
      cmdVusRef.current = n;
    } else if (n > cmdVusRef.current && !cmdOuvertRef.current) {
      setCmdNouveau(true);
    } else if (n < cmdVusRef.current) {
      cmdVusRef.current = n;
    }
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
      if (!document.hidden) {
        chargerCourses();
        chargerLivraisons();
      }
    };
    document.addEventListener('visibilitychange', surVisible);
    window.addEventListener('focus', surVisible);
    const it = setInterval(surVisible, 20000);
    return () => {
      document.removeEventListener('visibilitychange', surVisible);
      window.removeEventListener('focus', surVisible);
      clearInterval(it);
    };
  }, [chargerCourses, chargerLivraisons]);

  function ouvrirCourses() {
    setOutil('courses');
    coursesOuvertRef.current = true;
    vusRef.current = nbCourses;
    setCoursesNouveau(false);
  }

  // Tiroir des livraisons en cours : à l'ouverture on « marque comme vues »
  // (la pastille arrête de pulser jusqu'à la prochaine nouveauté).
  function ouvrirLivraisons() {
    setOutil('livraisons');
    cmdOuvertRef.current = true;
    cmdVusRef.current = livraisons.filter((c) => c.statut === 'en_cours').length;
    setCmdNouveau(false);
  }

  function fermerOutil() {
    if (outil === 'courses') {
      coursesOuvertRef.current = false;
      chargerCourses();
    }
    if (outil === 'livraisons') {
      cmdOuvertRef.current = false;
      chargerLivraisons();
    }
    setOutil(null);
  }

  const prenom = (profil?.nom ?? '').split(' ')[0];
  const cmdEnCoursListe = livraisons.filter((c) => c.statut === 'en_cours');
  const nbCmdEnCours = cmdEnCoursListe.length;
  const avancesJour = chromesJour.filter((c) => c.type === 'avance');
  const remboursementsJour = chromesJour.filter((c) => c.type === 'remboursement');
  const autresJour = chromesJour.filter((c) => c.type === 'autre');

  const configFaite =
    typeof localStorage !== 'undefined' && localStorage.getItem(`config-terminee:${utilisateur.id}`) === '1';

  return (
    <div className="page">
      <h1>Bonjour {prenom} 👋</h1>

      {estAdmin && !configFaite && (
        <Link to="/configuration" className="card banniere-config">
          <span className="banniere-config-emoji">🧭</span>
          <span>
            <strong>Configurer ton magasin pas à pas</strong>
            <span className="statut">Infos, équipe, comptabilité, produits — on te guide.</span>
          </span>
          <span className="banniere-config-fleche">→</span>
        </Link>
      )}

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

      {/* Suivi du jour en un clin d'œil : livraisons (les « en cours » restent
          affichées avec leur note tant qu'elles ne sont pas traitées, celles du
          jour déjà traitées/envoyées restent visibles), chromes et remboursements. */}
      {(chromesJour.length > 0 || livraisons.length > 0) && (
      <div className="card">
        <h2>Suivi du jour</h2>
        {livraisons.length > 0 && (
          <div className="histo-bloc">
            <Link to="/commandes" className="histo-titre lien-livraisons">
              🚚 Livraisons →
            </Link>
            {livraisons.map((c) => (
              <div key={c.id} className="histo-chrome">
                <span>
                  {c.statut === 'en_cours' ? '🕐' : c.statut === 'traitee' ? '✅' : c.statut === 'annulee' ? '🚫' : '📦'}{' '}
                  {c.clients?.surnom ?? 'Client'}
                  {c.note && c.statut === 'en_cours' && (
                    <span className="chrome-heure"> · 📝 {c.note}</span>
                  )}
                </span>
                {c.statut === 'annulee' ? (
                  <span className="chrome-heure">
                    {formatEuros(Number(c.montant))} · annulée{c.payee ? ' · à rembourser' : ''}
                  </span>
                ) : (
                  <span className={c.payee ? 'solde-ok' : 'dette'}>
                    {formatEuros(Number(c.montant))}
                    {c.payee ? ' · payée' : ' · à encaisser'}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
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
        {/* Remboursements du jour : info de suivi UNIQUEMENT — sans signe « − »,
            un remboursement n'apparaît pas comme un impact sur le CA (la vente a
            été comptée le jour de l'avance). */}
        {remboursementsJour.length > 0 && (
          <div className="histo-bloc">
            <span className="histo-titre">Remboursements du jour</span>
            {remboursementsJour.map((r, i) => (
              <div key={`r${i}`} className="histo-chrome">
                <span>
                  {r.clients?.surnom ?? 'client'}
                  <span className="chrome-heure"> · {r.users?.nom ?? '—'}</span>
                </span>
                <span className="solde-ok">{formatEuros(r.montant)}</span>
              </div>
            ))}
          </div>
        )}
        {autresJour.length > 0 && (
          <div className="histo-bloc">
            <span className="histo-titre">Autres</span>
            {autresJour.map((v, i) => (
              <div key={`v${i}`} className="histo-chrome">
                <span>
                  {v.clients?.surnom ?? 'client'}
                  <span className="chrome-heure"> · {v.users?.nom ?? '—'}</span>
                </span>
                <span>{formatEuros(v.montant)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="bulles-accueil">
        <button type="button" className="bulle-raccourci" onClick={ouvrirLivraisons}>
          <span className="bulle-rond">
            🚚
            {nbCmdEnCours > 0 && (
              <span className={`fab-badge ${cmdNouveau ? 'nouveau' : ''}`}>{nbCmdEnCours}</span>
            )}
          </span>
          <span className="bulle-label">Livraisons</span>
        </button>
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
        {estAdmin && (
          <Link to="/journal" className="bulle-raccourci">
            <span className="bulle-rond">🧾</span>
            <span className="bulle-label">Journal</span>
          </Link>
        )}
      </div>

      {veille && (
        <Link to="/veille" className="card banniere-config">
          <span className="banniere-config-emoji">📰</span>
          <span>
            <strong>News CBD</strong>
            <span className="statut">{veille.intro || 'Nouveautés légales, produits & fournisseurs — en un coup d’œil.'}</span>
          </span>
          <span className="banniere-config-fleche">→</span>
        </Link>
      )}

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
      {outil === 'livraisons' && (
        <div className="aide-fond" role="dialog" aria-modal="true" aria-label="Livraisons en cours" onClick={fermerOutil}>
          <div className="aide-modale" onClick={(e) => e.stopPropagation()}>
            <div className="aide-tete">
              <h2>🚚 Livraisons en cours</h2>
              <button type="button" className="btn btn-discret" onClick={fermerOutil}>
                Fermer
              </button>
            </div>
            {cmdEnCoursListe.length === 0 ? (
              <p className="vide">Aucune commande en cours 🎉</p>
            ) : (
              <div className="histo-bloc">
                {cmdEnCoursListe.map((c) => (
                  <div key={c.id} className="histo-chrome">
                    <span>
                      🕐 {c.clients?.surnom ?? 'Client'}
                      {c.note && <span className="chrome-heure"> · 📝 {c.note}</span>}
                    </span>
                    <span className={c.payee ? 'solde-ok' : 'dette'}>
                      {formatEuros(Number(c.montant))}
                      {c.payee ? ' · payée' : ' · à encaisser'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="form-inline">
              <Link to="/commandes?nouvelle=1" className="btn btn-primary" onClick={fermerOutil}>
                + Nouvelle commande
              </Link>
              <Link to="/commandes" className="btn" onClick={fermerOutil}>
                📦 Ouvrir les commandes
              </Link>
            </div>
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
