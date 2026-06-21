import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';

// Bloc d'explication (titre + texte).
function Section({ titre, children }) {
  return (
    <div>
      <h3>{titre}</h3>
      <p>{children}</p>
    </div>
  );
}

/**
 * Petit bouton « i » dans l'en-tête qui ouvre une fenêtre expliquant
 * comment l'outil fonctionne. Le contenu s'adapte au rôle (employé / admin).
 */
export default function Aide() {
  const { estAdmin, utilisateur } = useAuth();
  const [ouvert, setOuvert] = useState(false);

  // Réaffiche le guide de démarrage (efface le « masqué » mémorisé) et revient
  // à l'accueil où il s'affiche.
  function relancerGuide() {
    localStorage.removeItem(`guide-demarrage-masque:${utilisateur?.id}`);
    window.location.assign('/');
  }

  // Fermeture à la touche Échap quand la fenêtre est ouverte.
  useEffect(() => {
    if (!ouvert) return undefined;
    const surTouche = (e) => {
      if (e.key === 'Escape') setOuvert(false);
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [ouvert]);

  return (
    <>
      <button
        type="button"
        className="btn-aide"
        onClick={() => setOuvert(true)}
        aria-label="Aide — comment fonctionne l’outil"
        title="Aide"
      >
        i
      </button>

      {ouvert && (
        <div
          className="aide-fond"
          role="dialog"
          aria-modal="true"
          aria-label="Aide"
          onClick={() => setOuvert(false)}
        >
          <div className="aide-modale" onClick={(e) => e.stopPropagation()}>
            <div className="aide-tete">
              <h2>Comment ça marche ?</h2>
              <button
                type="button"
                className="btn btn-discret aide-fermer"
                onClick={() => setOuvert(false)}
              >
                Fermer
              </button>
            </div>

            <div className="aide-corps">
              <Section titre="Caisse — la clôture du jour">
                Saisissez vos encaissements <strong>CB</strong> et{' '}
                <strong>espèces (Moro)</strong>, ainsi que les chromes du jour. Le{' '}
                <strong>chiffre d’affaires est calculé automatiquement</strong> : pas de champ
                « ventes » à remplir à la main. Le récapitulatif à droite montre le CA et votre
                intéressement en temps réel.
              </Section>

              <Section titre="Le calcul du CA">
                CA = <strong>CB + espèces + avances − remboursements</strong>. Les{' '}
                <strong>encaissements</strong> (CB + espèces = l’argent réellement entré) sont
                affichés à part : ils diffèrent du CA dès qu’il y a des chromes, c’est normal.
              </Section>

              <Section titre="Chromes — les avances clients">
                Un « chrome » est une <strong>avance</strong> faite à un client (il repart avec de
                la marchandise sans payer tout de suite). Quand il rembourse, enregistrez un{' '}
                <strong>remboursement</strong>. Le solde de chaque client se met à jour seul
                (« Dette en cours » ou « Soldé »). Les clients sont repérés par un{' '}
                <strong>surnom</strong> uniquement, jamais par leur vrai nom.
              </Section>

              <Section titre="Journée partagée">
                Si plusieurs employés travaillent <strong>en même temps</strong>, une seule
                personne saisit la clôture et coche les collègues présents : l’intéressement est
                réparti à parts égales (CA ÷ nombre de personnes). Si vous vous relayez dans la
                journée, chacun saisit plutôt sa propre clôture.
              </Section>

              <Section titre="Historique">
                Retrouvez vos clôtures passées. En sélectionnant une date antérieure dans la
                Caisse, vous revoyez aussi ce qui avait été déclaré ce jour-là.
              </Section>

              {estAdmin && (
                <>
                  <Section titre="Dashboard (admin)">
                    Vue consolidée de toute l’équipe par période (jour, semaine, mois, année ou
                    période personnalisée), avec export <strong>CSV / Excel</strong> et{' '}
                    <strong>PDF</strong>.
                  </Section>
                  <Section titre="Comptabilité (admin)">
                    CA par mois / semaine / année, charges et fournisseurs (avec justificatifs
                    photo et lecture OCR du montant), et calcul du{' '}
                    <strong>bénéfice = CA − charges − fournisseurs</strong>.
                  </Section>
                  <Section titre="Paiements, fiches de paie & comptes (admin)">
                    Gérez les paiements employés, éditez les bulletins de paie, suivez l’activité
                    dans le Journal et créez / administrez les comptes. L’import permet de reprendre
                    un historique existant via des fichiers CSV.
                  </Section>
                </>
              )}

              <div>
                <h3>Guide de démarrage</h3>
                <p>Réaffiche la checklist « Premiers pas » sur la page Caisse.</p>
                <button type="button" className="btn" onClick={relancerGuide}>
                  🚀 Relancer le guide de démarrage
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
