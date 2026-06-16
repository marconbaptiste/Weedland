import { describe, it, expect } from 'vitest';
import { montantCotisation, calculerBulletin } from './bulletin.js';

describe('montantCotisation', () => {
  it('applique base × taux', () => {
    expect(montantCotisation(2000, 7)).toBe(140);
    expect(montantCotisation(2000, 0)).toBe(0);
  });
  it('arrondit au centime', () => {
    expect(montantCotisation(1234.56, 9.2)).toBe(113.58);
  });
});

describe('calculerBulletin', () => {
  it('calcule brut, cotisations, net et coût employeur', () => {
    const r = calculerBulletin({
      gains: [{ montant: 2000 }, { montant: 200 }], // brut 2200
      cotisations: [
        { base: 2200, taux_sal: 10, taux_pat: 25 }, // sal 220, pat 550
        { base: 2200, taux_sal: 5, taux_pat: 0 }, // sal 110, pat 0
      ],
      tauxPas: 5,
    });
    expect(r.brut).toBe(2200);
    expect(r.totalSal).toBe(330);
    expect(r.totalPat).toBe(550);
    expect(r.netAvantImpot).toBe(1870); // 2200 - 330
    expect(r.netImposable).toBe(1870); // défaut = net avant impôt
    expect(r.pas).toBe(93.5); // 1870 × 5 %
    expect(r.netPaye).toBe(1776.5); // 1870 - 93,5
    expect(r.coutEmployeur).toBe(2750); // 2200 + 550
  });

  it('respecte un net imposable saisi manuellement', () => {
    const r = calculerBulletin({
      gains: [{ montant: 2000 }],
      cotisations: [{ base: 2000, taux_sal: 10, taux_pat: 0 }],
      netImposable: 1850,
      tauxPas: 10,
    });
    expect(r.netAvantImpot).toBe(1800);
    expect(r.netImposable).toBe(1850);
    expect(r.pas).toBe(185);
    expect(r.netPaye).toBe(1615); // 1800 - 185
  });

  it('sans cotisations : net = brut', () => {
    const r = calculerBulletin({ gains: [{ montant: 1500 }], cotisations: [] });
    expect(r.brut).toBe(1500);
    expect(r.netAvantImpot).toBe(1500);
    expect(r.coutEmployeur).toBe(1500);
  });
});
