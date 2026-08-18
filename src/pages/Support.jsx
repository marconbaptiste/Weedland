import { useAuth } from '../auth/AuthProvider';
import Messagerie from '../components/Messagerie';

// Page Support (admin de magasin) : fil de discussion avec l'exploitant.
export default function Support() {
  const { magasinId } = useAuth();
  return (
    <div className="page">
      <h1>Faire une doléance</h1>
      <div className="card">
        <p className="statut">
          Une question, une demande, un souci, une idée ? Écris-nous ici — on te répond directement
          dans cette messagerie.
        </p>
        <Messagerie magasinId={magasinId} superadmin={false} />
      </div>
    </div>
  );
}
