import { describe, it, expect } from 'vitest';
import { decomposer } from './monnaie';

describe('decomposer (rendu de monnaie)', () => {
  it('rend la monnaie avec le moins de coupures possible', () => {
    expect(decomposer(47.5)).toEqual([
      { valeur: 20, nombre: 2 },
      { valeur: 5, nombre: 1 },
      { valeur: 2, nombre: 1 },
      { valeur: 0.5, nombre: 1 },
    ]);
  });

  it('gère les centimes sans erreur de virgule flottante', () => {
    expect(decomposer(0.1 + 0.2)).toEqual([
      { valeur: 0.2, nombre: 1 },
      { valeur: 0.1, nombre: 1 },
    ]);
  });

  it('retourne une liste vide pour 0 ou un montant négatif', () => {
    expect(decomposer(0)).toEqual([]);
    expect(decomposer(-5)).toEqual([]);
  });
});
