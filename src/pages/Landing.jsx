import { Link } from 'react-router-dom';

// Page publique de présentation (commercialisation). Accessible aux visiteurs
// non connectés. Le nom du produit est volontairement centralisé ici (NOM).
const NOM = 'Weedland';

const ATOUTS = [
  { emoji: '⚡', titre: 'Caisse en 1 minute', texte: 'Clôture journalière rapide sur mobile au comptoir. Le chiffre d’affaires se calcule tout seul.' },
  { emoji: '🤝', titre: 'Dettes clients (chromes)', texte: 'Suis les avances et remboursements de chaque client, soldes à jour en temps réel.' },
  { emoji: '📦', titre: 'Gestion des stocks', texte: 'Inventaire par catégorie, alertes de réappro, mouvements rapides entrée/sortie.' },
  { emoji: '📊', titre: 'Compta & bénéfice', texte: 'CA par mois/semaine/année, charges et fournisseurs, bénéfice calculé. Exports CSV & PDF.' },
  { emoji: '🏪', titre: 'Multi-magasin', texte: 'Gère plusieurs boutiques, chacune totalement cloisonnée. Bascule en un clic.' },
  { emoji: '🔒', titre: 'Sécurisé', texte: 'Connexion Google ou mot de passe, accès par autorisation, données protégées (RLS).' },
];

const ETAPES = [
  { n: '1', titre: 'Crée ton magasin', texte: 'Inscris-toi avec ton code et ouvre ta boutique en quelques secondes.' },
  { n: '2', titre: 'Ajoute ton équipe', texte: 'Crée les comptes de tes employés et tes premiers produits/clients.' },
  { n: '3', titre: 'Encaisse & suis', texte: 'Tes employés clôturent la caisse ; toi tu suis le CA et le bénéfice.' },
];

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-tete">
        <span className="logo">{NOM}</span>
        <Link to="/connexion" className="btn btn-discret">Se connecter</Link>
      </header>

      <section className="landing-hero">
        <h1>La gestion simple de ton magasin de CBD</h1>
        <p className="landing-sous">
          Caisse, dettes clients, stocks et comptabilité — rapide au comptoir sur mobile,
          consultable sur ordinateur. Fini le suivi sur WhatsApp.
        </p>
        <div className="landing-actions">
          <Link to="/inscription" className="btn btn-primary">Créer mon magasin</Link>
          <Link to="/connexion" className="btn">J’ai déjà un compte</Link>
        </div>
      </section>

      <section className="landing-features">
        {ATOUTS.map((a) => (
          <div key={a.titre} className="feature-card">
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
            <div key={e.n} className="etape-card">
              <div className="etape-num">{e.n}</div>
              <h3>{e.titre}</h3>
              <p>{e.texte}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-cta">
        <h2>Prêt à démarrer ?</h2>
        <Link to="/inscription" className="btn btn-primary">Créer mon magasin</Link>
      </section>

      <footer className="landing-pied">
        <span>© {new Date().getFullYear()} {NOM}</span>
      </footer>
    </div>
  );
}
