import { describe, it, expect } from 'vitest';
import { classifier, analyserFichiers } from './importHistorique.js';
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
