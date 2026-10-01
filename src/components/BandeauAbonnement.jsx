import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { formatDateFr } from '../lib/format';

// Bandeau d'alerte abonnement, affiché en haut de l'app (Layout) pour l'ADMIN :
//  - fin d'essai dans ≤ 3 jours sans abonnement Stripe → « abonne-toi » ;
//  - prélèvement en échec (`past_due`, grâce accordée) → « mets à jour ta carte ».
// Le superadmin et les magasins `gratuit` ne le voient jamais.
export default function BandeauAbonnement() {
  const { estAdmin, estSuperadmin, magasinInfo } = useAuth();
  if (!estAdmin || estSuperadmin || !magasinInfo || magasinInfo.gratuit) return null;

  const aujourdHui = new Date();
  aujourdHui.setHours(0, 0, 0, 0);

  if (magasinInfo.stripe_subscription_id) {
    if (magasinInfo.stripe_statut !== 'past_due') return null;
    return (
      <div className="bandeau-abonnement bandeau-alerte" role="status">
        ⚠️ Ton dernier prélèvement a échoué. Mets à jour ta carte pour éviter la suspension.{' '}
        <Link to="/gestion" className="bandeau-lien">
          Gérer mon abonnement →
        </Link>
      </div>
    );
  }

  if (magasinInfo.abonnement !== 'essai' || !magasinInfo.essai_fin) return null;
  const fin = new Date(`${magasinInfo.essai_fin}T00:00:00`);
  const joursRestants = Math.ceil((fin - aujourdHui) / 86400000);
  if (joursRestants > 3) return null;

  return (
    <div className="bandeau-abonnement" role="status">
      ⏳{' '}
      {joursRestants <= 0
        ? "Ta période d'essai se termine aujourd'hui."
        : `Ta période d'essai se termine le ${formatDateFr(magasinInfo.essai_fin)} (${joursRestants} jour${joursRestants > 1 ? 's' : ''}).`}{' '}
      Abonne-toi pour garder l'accès — tes données sont conservées.{' '}
      <Link to="/gestion" className="bandeau-lien">
        S'abonner →
      </Link>
    </div>
  );
}
