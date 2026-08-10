import InfosMagasin from '../components/InfosMagasin';

// Page (admin) — « À propos du magasin » : coordonnées + horaires d'ouverture.
// Ces infos servent de base au planning ET s'affichent sur la carte de fidélité
// publique des clients.
export default function AProposMagasin() {
  return (
    <div className="page">
      <h1>À propos du magasin</h1>
      <InfosMagasin />
    </div>
  );
}
