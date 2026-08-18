import { Link } from 'react-router-dom';
import Logo, { FeuilleKanabiz } from '../components/Logo';
import { SOCLE, OPTIONS_TARIFS } from '../lib/tarifs';

// Page publique de présentation (commercialisation). Accessible aux visiteurs
// non connectés. Thème Liquid Glass, marque Kanabiz.

const ATOUTS = [
  { emoji: '⚡', titre: 'Caisse en 1 minute', texte: 'Clôture journalière ultra-rapide au comptoir. Le chiffre d’affaires se calcule tout seul.' },
  { emoji: '🤝', titre: 'Dettes & fidélité clients', texte: 'Avances, remboursements et cartes de fidélité à tampons — soldes à jour en temps réel.' },
  { emoji: '📦', titre: 'Stocks intelligents', texte: 'Inventaire par catégorie, alertes de réappro, entrées/sorties en un geste, import par photo.' },
  { emoji: '📈', titre: 'Pilotage & bénéfice', texte: 'CA jour / semaine / mois, charges, fournisseurs, bénéfice calculé. Exports CSV & PDF.' },
  { emoji: '🏪', titre: 'Multi-magasin', texte: 'Plusieurs boutiques, chacune totalement cloisonnée. Bascule en un clic.' },
  { emoji: '🔒', titre: 'Sécurisé & privé', texte: 'Connexion Google ou mot de passe, accès par autorisation, données protégées (RLS).' },
];

// Tarifs (HT / mois / magasin). Les prix viennent de src/lib/tarifs.js —
// la même grille que l'écran « Abonnement & options » dans l'app.
const PACKS_LANDING = [
  {
    nom: 'Comptoir',
    prix: SOCLE,
    accroche: 'L’essentiel du comptoir',
    inclus: ['Caisse & clôtures en 1 minute', 'Dettes clients (avances / remboursements)', 'Fiches clients & journal d’activité', 'Comptes équipe & intéressement', 'Multi-employés, mobile-first'],
    mis_en_avant: false,
  },
  {
    nom: 'Boutique',
    prix: 45,
    accroche: 'Socle + Stocks + Fidélité',
    inclus: ['Tout Comptoir', 'Stocks & achats (alertes, import facture)', 'Fidélité & promos (carte QR anti-triche)'],
    mis_en_avant: false,
  },
  {
    nom: 'Premium',
    prix: 69,
    accroche: 'Tout, IA incluse',
    inclus: ['Tout Boutique', 'Commandes & livraisons', 'Planning & horaires', 'Compta Pro (TVA, compte de résultat)', 'News IA ciblée sur ta boutique'],
    mis_en_avant: true,
  },
];

const ETAPES = [
  { n: '1', titre: 'Crée ton magasin', texte: 'Inscris-toi avec ton code et ouvre ta boutique en quelques secondes.' },
  { n: '2', titre: 'Ajoute ton équipe', texte: 'Crée les comptes de tes employés, tes produits et tes clients.' },
  { n: '3', titre: 'Encaisse & suis', texte: 'Tes employés clôturent la caisse ; toi, tu suis le CA et le bénéfice.' },
];

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-tete">
        <Logo taille={24} />
        <Link to="/connexion" className="btn btn-discret">Se connecter</Link>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-logo">
          <FeuilleKanabiz taille={96} />
        </div>
        <h1>
          La gestion <span className="accentue">simple et élégante</span><br />
          de ton magasin de CBD
        </h1>
        <p className="landing-sous">
          Caisse, dettes clients, stocks et comptabilité — rapide au comptoir sur mobile,
          consultable sur ordinateur. Fini le suivi sur WhatsApp.
        </p>
        <div className="landing-actions">
          <Link to="/inscription" className="btn btn-primary btn-lg">Créer mon magasin</Link>
          <Link to="/connexion" className="btn btn-lg">J’ai déjà un compte</Link>
        </div>
      </section>

      <section className="landing-features">
        {ATOUTS.map((a) => (
          <div key={a.titre} className="card feature-card">
            <div className="feature-emoji">{a.emoji}</div>
            <h3>{a.titre}</h3>
            <p>{a.texte}</p>
          </div>
        ))}
      </section>

      <section className="landing-etapes">
        <h2>Comment ça marche</h2>
        <div className="etapes-grille">
          {ETAPES.map((e) => (
            <div key={e.n} className="card etape-card">
              <div className="etape-num">{e.n}</div>
              <h3>{e.titre}</h3>
              <p>{e.texte}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-tarifs">
        <h2>Des tarifs simples, à la carte</h2>
        <p className="landing-sous">
          Un socle accessible, des options que tu actives quand tu en as besoin — sans engagement,
          essai 14 jours. Prix HT / mois / magasin.
        </p>
        <div className="tarifs-grille">
          {PACKS_LANDING.map((p) => (
            <div key={p.nom} className={`card tarif-card ${p.mis_en_avant ? 'tarif-star' : ''}`}>
              {p.mis_en_avant && <span className="tarif-badge">Le plus choisi</span>}
              <h3>{p.nom}</h3>
              <div className="tarif-prix">
                {p.prix} €<span className="tarif-mois">/mois</span>
              </div>
              <p className="tarif-accroche">{p.accroche}</p>
              <ul className="tarif-liste">
                {p.inclus.map((l) => (
                  <li key={l}>✓ {l}</li>
                ))}
              </ul>
              <Link to="/inscription" className={`btn ${p.mis_en_avant ? 'btn-primary' : ''}`}>
                Commencer
              </Link>
            </div>
          ))}
        </div>
        <p className="tarif-note">
          Options à la carte :{' '}
          {OPTIONS_TARIFS.map((o) => `${o.nom.replace(/^\S+\s/, '')} +${o.prix} €`).join(' · ')}.
          <br />
          Pack Pro (tout sauf IA) : 59 € · Abonnement annuel : 2 mois offerts · 2ᵉ magasin : −20 %.
        </p>
      </section>

      <section className="landing-cta card">
        <FeuilleKanabiz taille={54} />
        <h2>Prêt à faire pousser ton business ?</h2>
        <Link to="/inscription" className="btn btn-primary btn-lg">Créer mon magasin</Link>
      </section>

      <footer className="landing-pied">
        <Logo taille={18} />
        <span className="landing-copy">© {new Date().getFullYear()} Kanabiz</span>
        <nav className="landing-liens">
          <Link to="/cgu">CGU</Link>
          <Link to="/confidentialite">Confidentialité</Link>
        </nav>
      </footer>
    </div>
  );
}
