import { describe, it, expect } from 'vitest';
import { extraireMontant, extraireLignesFacture } from './ocr.js';

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

describe('extraireLignesFacture', () => {
  it('extrait produit + quantité + unité', () => {
    const t = `Amnesia 100 g\nResine Maroc 50g`;
    const r = extraireLignesFacture(t);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ produit: 'Amnesia', quantite: '100', unite: 'g' });
    expect(r[1]).toMatchObject({ quantite: '50', unite: 'g' });
  });

  it('reconnaît kg et pièces', () => {
    expect(extraireLignesFacture('Pollen 2 kg')[0]).toMatchObject({ quantite: '2', unite: 'kg' });
    expect(extraireLignesFacture('Briquets 24 pièces')[0]).toMatchObject({ unite: 'pièce' });
  });

  it('ignore les lignes d’en-tête et de total', () => {
    const t = `FACTURE N°123\nDate : 26/06/2026\nAmnesia 100 g\nTOTAL TTC 250,00\nTVA 20%`;
    const r = extraireLignesFacture(t);
    expect(r).toHaveLength(1);
    expect(r[0].produit).toBe('Amnesia');
  });

  it('ignore les lignes sans texte produit', () => {
    expect(extraireLignesFacture('12,50\n---\n')).toHaveLength(0);
  });

  it('renvoie un tableau vide si pas de texte', () => {
    expect(extraireLignesFacture('')).toEqual([]);
  });
});
