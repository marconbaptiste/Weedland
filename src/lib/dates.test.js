import { describe, it, expect } from 'vitest';
import { decalerReference, intervallePeriode } from './dates.js';

describe('decalerReference', () => {
  it('recule / avance d’un jour', () => {
    expect(decalerReference('jour', '2026-07-01', -1)).toBe('2026-06-30');
    expect(decalerReference('jour', '2026-07-01', 1)).toBe('2026-07-02');
  });

  it('recule / avance d’une semaine', () => {
    expect(decalerReference('semaine', '2026-07-08', -1)).toBe('2026-07-01');
    expect(decalerReference('semaine', '2026-07-01', 1)).toBe('2026-07-08');
  });

  it('recule d’un mois (juillet -> juin) et gère les fins de mois', () => {
    expect(decalerReference('mois', '2026-07-15', -1)).toBe('2026-06-15');
    // 31 juillet -> pas de 31 juin : JS retombe sur juillet, on accepte le report
    expect(decalerReference('mois', '2026-03-31', -1)).toBe('2026-03-03');
  });

  it('recule / avance d’une année', () => {
    expect(decalerReference('annee', '2026-07-01', -1)).toBe('2025-07-01');
    expect(decalerReference('annee', '2026-07-01', 1)).toBe('2027-07-01');
  });

  it('la nouvelle référence retombe bien dans le mois précédent', () => {
    const ref = decalerReference('mois', '2026-07-10', -1);
    const [debut, fin] = intervallePeriode('mois', ref);
    expect(debut).toBe('2026-06-01');
    expect(fin).toBe('2026-06-30');
  });
});
