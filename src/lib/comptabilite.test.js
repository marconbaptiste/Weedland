import { describe, it, expect } from 'vitest';
import {
  enCentimes,
  somme,
  totalAvances,
  totalRemboursements,
  soldeClient,
  statutSolde,
  caJour,
  encaissements,
  reconciliation,
  interessement,
  resumeJour,
} from './comptabilite.js';

describe('arithmétique en centimes (sécurité flottant)', () => {
  it('évite les erreurs de virgule flottante', () => {
    expect(somme([0.1, 0.2])).toBe(0.3); // 0.1 + 0.2 === 0.30000000000000004 en flottant
    expect(enCentimes(19.99)).toBe(1999);
    expect(somme([10.1, 10.2, 10.3])).toBe(30.6);
  });
});

describe('chromes : avances, remboursements, solde', () => {
  const lignes = [
    { type: 'avance', montant: 50 },
    { type: 'avance', montant: 30 },
    { type: 'remboursement', montant: 20 },
  ];

  it('totalise avances et remboursements', () => {
    expect(totalAvances(lignes)).toBe(80);
    expect(totalRemboursements(lignes)).toBe(20);
  });

  it('calcule le solde dû (Σ avances − Σ remboursements)', () => {
    expect(soldeClient(lignes)).toBe(60);
  });

  it('statut "Dette en cours" si solde > 0, sinon "Soldé"', () => {
    expect(statutSolde(60)).toBe('Dette en cours');
    expect(statutSolde(0)).toBe('Soldé');
  });

  it('un client entièrement remboursé est soldé', () => {
    const soldees = [
      { type: 'avance', montant: 40 },
      { type: 'remboursement', montant: 40 },
    ];
    expect(soldeClient(soldees)).toBe(0);
    expect(statutSolde(soldeClient(soldees))).toBe('Soldé');
  });
});

describe('CA du jour', () => {
  it('vente directe simple sans chromes : CA = ventes directes', () => {
    expect(caJour({ ventesDirectes: 200, avances: 0, remboursements: 0 })).toBe(200);
  });

  it('une avance AUGMENTE le CA du jour', () => {
    expect(caJour({ ventesDirectes: 200, avances: 50, remboursements: 0 })).toBe(250);
  });

  it('un remboursement DIMINUE le CA du jour', () => {
    expect(caJour({ ventesDirectes: 200, avances: 0, remboursements: 30 })).toBe(170);
  });

  it('combine ventes, avances et remboursements', () => {
    expect(caJour({ ventesDirectes: 200, avances: 80, remboursements: 20 })).toBe(260);
  });
});

describe('encaissements (CB + espèces)', () => {
  it('additionne CB et espèces', () => {
    expect(encaissements({ cb: 120, especes: 80 })).toBe(200);
  });
});

describe('CA ≠ Encaissements dès qu’il y a des chromes', () => {
  it('avance non payée : CA > encaissements', () => {
    // 200 de ventes payées (120 CB + 80 espèces) + une avance de 50 (non encaissée)
    const ca = caJour({ ventesDirectes: 200, avances: 50, remboursements: 0 });
    const enc = encaissements({ cb: 120, especes: 80 });
    expect(ca).toBe(250);
    expect(enc).toBe(200);
    expect(ca).not.toBe(enc);
  });
});

describe('réconciliation de caisse', () => {
  it('voyant vert : (CB + espèces) = ventes directes + remboursements', () => {
    // 200 de ventes directes + 30 de remboursement reçu = 230 attendus, présents en caisse
    const r = reconciliation({ cb: 150, especes: 80, ventesDirectes: 200, remboursements: 30 });
    expect(r.attendu).toBe(230);
    expect(r.reel).toBe(230);
    expect(r.ecart).toBe(0);
    expect(r.coherent).toBe(true);
  });

  it('les avances ne doivent PAS être en caisse', () => {
    // avance de 50 : elle gonfle le CA mais ne rentre pas en caisse -> caisse OK à 200
    const r = reconciliation({ cb: 120, especes: 80, ventesDirectes: 200, remboursements: 0 });
    expect(r.coherent).toBe(true);
  });

  it('voyant rouge avec écart chiffré si manque en caisse', () => {
    const r = reconciliation({ cb: 100, especes: 80, ventesDirectes: 200, remboursements: 0 });
    expect(r.attendu).toBe(200);
    expect(r.reel).toBe(180);
    expect(r.ecart).toBe(-20);
    expect(r.coherent).toBe(false);
  });

  it('voyant rouge avec excédent en caisse', () => {
    const r = reconciliation({ cb: 130, especes: 80, ventesDirectes: 200, remboursements: 0 });
    expect(r.ecart).toBe(10);
    expect(r.coherent).toBe(false);
  });
});

describe('intéressement (pourcentage du CA)', () => {
  it('applique le pourcentage au CA', () => {
    expect(interessement(200, 5)).toBe(10);
    expect(interessement(1000, 2.5)).toBe(25);
  });

  it('vaut 0 sans pourcentage', () => {
    expect(interessement(200, 0)).toBe(0);
    expect(interessement(200, undefined)).toBe(0);
  });

  it('arrondit au centime', () => {
    // 333,33 € à 3 % = 9,9999 -> 10,00 €
    expect(interessement(333.33, 3)).toBe(10);
  });

  it('divise la base par le nombre de personnes (journée partagée à parts égales)', () => {
    // CA 800 €, 2 personnes, 5 % -> (800 / 2) × 5 % = 20 €
    expect(interessement(800, 5, 2)).toBe(20);
    // 3 personnes
    expect(interessement(900, 10, 3)).toBe(30);
    // nbPersonnes absent/0/1 -> pas de division
    expect(interessement(200, 5, 1)).toBe(10);
    expect(interessement(200, 5, 0)).toBe(10);
  });
});

describe('resumeJour (vue d’ensemble temps réel)', () => {
  it('agrège caisse + chromes du jour', () => {
    const caisse = { ventes_directes: 200, cb: 150, especes: 80 };
    const chromes = [
      { type: 'avance', montant: 50 },
      { type: 'remboursement', montant: 30 },
    ];
    const r = resumeJour(caisse, chromes);
    expect(r.avances).toBe(50);
    expect(r.remboursements).toBe(30);
    expect(r.ca).toBe(220); // 200 + 50 - 30
    expect(r.encaissements).toBe(230); // 150 + 80
    expect(r.reconciliation.attendu).toBe(230); // 200 + 30
    expect(r.reconciliation.coherent).toBe(true);
  });

  it('fonctionne sans aucune ligne de chrome', () => {
    const r = resumeJour({ ventes_directes: 100, cb: 60, especes: 40 }, []);
    expect(r.ca).toBe(100);
    expect(r.encaissements).toBe(100);
    expect(r.reconciliation.coherent).toBe(true);
    expect(r.interessement).toBe(0);
  });

  it('calcule l’intéressement sur le CA du jour', () => {
    const caisse = { ventes_directes: 200, cb: 150, especes: 80, pourcentage_interessement: 5 };
    const chromes = [{ type: 'avance', montant: 50 }, { type: 'remboursement', montant: 30 }];
    const r = resumeJour(caisse, chromes);
    expect(r.ca).toBe(220); // 200 + 50 - 30
    expect(r.interessement).toBe(11); // 220 × 5 %
  });
});
