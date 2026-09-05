// Nom de marque du produit, centralisé (landing + pages légales).
// Change-le ici pour renommer le produit partout sur les pages publiques.
export const NOM = 'Kanabiz';

// Version des documents légaux (CGV/CGU/confidentialité). Une date FIXE, pas
// « aujourd'hui » : c'est la version que le client accepte à l'inscription
// (enregistrée dans magasins.cgv_version) et qu'on peut prouver ensuite.
// À incrémenter à CHAQUE modification des textes.
export const VERSION_LEGAL = '2026-09-04';

// Coordonnées légales — À COMPLÉTER par l'exploitant.
export const EDITEUR = {
  societe: '[Nom de la société]',
  forme: '[Forme juridique — ex. SAS]',
  capital: '[Capital social]',
  siege: '[Adresse du siège]',
  siret: '[SIRET]',
  rcs: '[RCS / ville]',
  tva: '[N° TVA intracommunautaire ou « TVA non applicable, art. 293 B du CGI »]',
  directeur: '[Directeur de la publication]',
  email: '[email de contact]',
  hebergeur: 'Supabase (base de données, région UE) et Vercel (hébergement web)',
};

// Sous-traitants ultérieurs (art. 28 RGPD) — liste réelle déduite du code.
export const SOUS_TRAITANTS = [
  { nom: 'Supabase Inc.', role: 'Base de données, authentification, stockage des fichiers, fonctions serveur', lieu: 'Union européenne (région du projet) — société américaine, clauses contractuelles types' },
  { nom: 'Vercel Inc.', role: 'Hébergement de l’application web (journaux d’accès techniques)', lieu: 'États-Unis — clauses contractuelles types' },
  { nom: 'Stripe Payments Europe Ltd', role: 'Facturation et paiement des abonnements (données de facturation de l’administrateur)', lieu: 'Irlande / États-Unis' },
  { nom: 'Google LLC', role: 'Connexion « Google » (OAuth), si utilisée', lieu: 'États-Unis' },
  { nom: 'Anthropic PBC', role: 'Génération du bulletin « News » (catégories et noms de produits du stock uniquement — aucune donnée personnelle)', lieu: 'États-Unis' },
  { nom: 'GitHub (Microsoft)', role: 'Sauvegardes chiffrées de la base (AES-256), conservées 30 jours', lieu: 'États-Unis' },
  { nom: 'jsDelivr (CDN)', role: 'Chargement des fichiers de reconnaissance de texte (OCR) — la photo reste sur l’appareil', lieu: 'CDN mondial' },
];
