import { describe, it, expect } from 'vitest';
import { extraireMontant } from './ocr.js';

describe('extraireMontant', () => {
  it('privilégie la ligne TOTAL TTC', () => {
    const t = `BOULANGERIE\nPain 1,20\nCafe 2,50\nTOTAL TTC 3,70\nCB 3,70`;
    expect(extraireMontant(t)).toBe(3.7);
  });

  it('reconnaît "Net à payer"', () => {
    const t = `Article A 10,00\nArticle B 5,50\nNet à payer : 15,50 EUR`;
    expect(extraireMontant(t)).toBe(15.5);
  });

  it('accepte le point ou la virgule décimale', () => {
    expect(extraireMontant('TOTAL 12.99')).toBe(12.99);
    expect(extraireMontant('TOTAL 12,99')).toBe(12.99);
  });

  it('à défaut de mot-clé, prend le plus grand montant', () => {
    const t = `Truc 4,00\nMachin 9,90\nBidule 1,20`;
    expect(extraireMontant(t)).toBe(9.9);
  });

  it('renvoie null si aucun montant', () => {
    expect(extraireMontant('aucun chiffre ici')).toBe(null);
    expect(extraireMontant('')).toBe(null);
  });

  it('ignore les entiers sans décimales', () => {
    expect(extraireMontant('Quantité 12\nTOTAL 7,30')).toBe(7.3);
  });
});
