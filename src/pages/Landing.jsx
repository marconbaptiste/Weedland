import { Link } from 'react-router-dom';
import Logo, { FeuilleKanabiz } from '../components/Logo';

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
