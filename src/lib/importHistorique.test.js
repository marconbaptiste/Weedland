import { describe, it, expect } from 'vitest';
import { classifier, analyserFichiers, analyserChromes, analyserStocks } from './importHistorique.js';
import { parseCSV } from './csv.js';

const REVENUS = `Date;CA;CB;Moro
1 mars 2026;1 895 €;1 185 €;610 €
2 mars 2026;1 064 €;820 €;210 €
Revenus totaux;36 594 €;22 120 €;12 614 €`;

const DEPENSES = `Charges ;
Loyer Roissy ;1 731 €
Total énergie ;252 €
Dépenses totales;15 538 €`;

const FOURNISSEURS = `Fournisseur s;
Tout cumulé ;12 586 €`;

const SEMAINE = `CA semaine ;
Week 1;7 795 €`;

describe('classifier', () => {
  it('reconnaît les types de tableaux', () => {
    expect(classifier(parseCSV(REVENUS))).toBe('caisse');
    expect(classifier(parseCSV(DEPENSES))).toBe('charges');
    expect(classifier(parseCSV(FOURNISSEURS))).toBe('fournisseurs');
    expect(classifier(parseCSV(SEMAINE))).toBe('ignore');
  });
});

describe('analyserFichiers', () => {
  it('dispatche caisse / charges / fournisseurs et ignore le reste', () => {
    const r = analyserFichiers([
      { nom: 'Mars 2026-Revenus.csv', texte: REVENUS },
      { nom: 'Mars 2026-Dépenses.csv', texte: DEPENSES },
      { nom: 'Avril 2026-Dépenses-1.csv', texte: FOURNISSEURS },
      { nom: 'Mars 2026-Mars.csv', texte: SEMAINE },
    ]);

    // Caisse : 2 jours valides (le total est ignoré)
    expect(r.caisse).toHaveLength(2);
    expect(r.caisse[0]).toEqual({ date: '2026-03-01', ventes_directes: 1895, cb: 1185, especes: 610 });

    // Charges : « Total énergie » gardé, « Dépenses totales » exclu, mois du nom de fichier
    expect(r.charges).toHaveLength(2);
    expect(r.charges).toContainEqual({ mois: '2026-03-01', libelle: 'Loyer Roissy', montant: 1731 });
    expect(r.charges).toContainEqual({ mois: '2026-03-01', libelle: 'Total énergie', montant: 252 });

    // Fournisseurs : « Tout cumulé » est la donnée réelle -> conservée
    expect(r.fournisseurs).toContainEqual({ mois: '2026-04-01', libelle: 'Tout cumulé', montant: 12586 });

    // Le tableau hebdo est ignoré
    expect(r.ignores).toContain('Mars 2026-Mars.csv');
  });
});

describe('analyserChromes', () => {
  const CSV = `date,client,type,montant_eur,produit,note
2026-06-08,Adam,Dette,359,,consolide
2026-06-11,Costaud (pote de Redouane),Manquement,5.4,"Candy 3,77g + preroll","Paye 67€ au lieu de 72,80€"
2026-06-05,Non specifie,Encaissement oublie,33,,perte caisse
2026-06-13,Mel,Remboursement,20,,`;

  it('mappe les types et ignore « Non spécifié »', () => {
    const r = analyserChromes(CSV);
    expect(r).toHaveLength(3); // Non specifie exclu
    expect(r).toContainEqual({ date: '2026-06-08', surnom: 'Adam', type: 'avance', montant: 359 });
    // montant avec virgule décimale dans un champ, séparateur ailleurs
    expect(r).toContainEqual({ date: '2026-06-11', surnom: 'Costaud (pote de Redouane)', type: 'avance', montant: 5.4 });
    expect(r).toContainEqual({ date: '2026-06-13', surnom: 'Mel', type: 'remboursement', montant: 20 });
  });
});

describe('analyserStocks', () => {
  it('mappe catégorie / produit / quantité avec en-têtes souples', () => {
    const csv = `Catégorie;Produit;Quantité
Fleurs;Amnesia;120,5
Résines;Charas;30
;;`; // ligne vide ignorée
    const r = analyserStocks(csv);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ categorie: 'Fleurs', nom: 'Amnesia', quantite: 120.5 });
    expect(r[1]).toEqual({ categorie: 'Résines', nom: 'Charas', quantite: 30 });
  });

  it('accepte des noms de colonnes variés (qté, article) et ignore les lignes sans produit', () => {
    const csv = `article,qte
Huile 10%,8
,5`;
    const r = analyserStocks(csv);
    expect(r).toEqual([{ categorie: '', nom: 'Huile 10%', quantite: 8 }]);
  });
});
