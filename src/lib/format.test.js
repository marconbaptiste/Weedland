import { describe, it, expect } from 'vitest';
import { parseMontant, formatEuros, formatNombre } from './format.js';

describe('parseMontant (saisie française)', () => {
  it('accepte la virgule décimale', () => {
    expect(parseMontant('12,50')).toBe(12.5);
  });

  it('accepte les séparateurs de milliers et le symbole €', () => {
    expect(parseMontant('1 234,56')).toBe(1234.56);
    expect(parseMontant('1 234,56 €')).toBe(1234.56);
  });

  it('accepte aussi le point décimal', () => {
    expect(parseMontant('12.5')).toBe(12.5);
  });

  it('renvoie un number tel quel', () => {
    expect(parseMontant(42)).toBe(42);
  });

  it('renvoie 0 pour une saisie vide ou invalide', () => {
    expect(parseMontant('')).toBe(0);
    expect(parseMontant('abc')).toBe(0);
    expect(parseMontant(null)).toBe(0);
  });
});

describe('formatEuros / formatNombre', () => {
  it('formate en euros français à 2 décimales', () => {
    // Intl utilise des espaces insécables : on compare via parseMontant.
    expect(parseMontant(formatEuros(1234.5))).toBe(1234.5);
    expect(formatEuros(1234.5)).toContain('€');
  });

  it('formate un nombre sans symbole', () => {
    expect(formatNombre(0)).toBe('0,00');
  });
});
