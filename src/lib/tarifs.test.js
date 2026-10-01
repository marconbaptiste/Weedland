import { describe, it, expect } from 'vitest';
import { SOCLE, OPTIONS_TARIFS, calculerMensuel } from './tarifs';

describe('grille tarifaire', () => {
  it('socle seul sans option', () => {
    expect(calculerMensuel([])).toEqual({ plein: SOCLE, total: SOCLE, pack: null, remise: 0 });
  });

  it('additionne les options à la carte (sans pack)', () => {
    const r = calculerMensuel(['stock']);
    expect(r.total).toBe(29 + 10);
    expect(r.pack).toBeNull();
  });

  it('pack Boutique : stocks + fidélité plafonnés à 45 €', () => {
    const r = calculerMensuel(['stock', 'fidelite']);
    expect(r.plein).toBe(29 + 10 + 12);
    expect(r.total).toBe(45);
    expect(r.pack?.cle).toBe('boutique');
    expect(r.remise).toBe(6);
  });

  it('pack Boutique + option hors pack : le pack reste appliqué', () => {
    const r = calculerMensuel(['stock', 'fidelite', 'planning']);
    expect(r.total).toBe(45 + 8);
    expect(r.pack?.cle).toBe('boutique');
  });

  it('pack Pro : tout sauf News IA à 59 €', () => {
    const r = calculerMensuel(['stock', 'fidelite', 'livraisons', 'planning', 'compta']);
    expect(r.plein).toBe(29 + 10 + 12 + 8 + 8 + 12);
    expect(r.total).toBe(59);
    expect(r.pack?.cle).toBe('pro');
  });

  it('pack Premium : toutes les options à 69 €', () => {
    const toutes = OPTIONS_TARIFS.map((o) => o.cle);
    const r = calculerMensuel(toutes);
    expect(r.plein).toBe(88);
    expect(r.total).toBe(69);
    expect(r.pack?.cle).toBe('premium');
    expect(r.remise).toBe(19);
  });

  it('le pack le plus complet prime (pas de Pro + News sous le prix Premium)', () => {
    // Toutes les options actives → Premium 69 s'applique, PAS Pro 59 + News 9 = 68.
    const r = calculerMensuel(OPTIONS_TARIFS.map((o) => o.cle));
    expect(r.pack?.cle).toBe('premium');
    expect(r.total).toBe(69);
    // Et Pro (59) reste bien plus avantageux que Boutique + le reste à la carte.
    expect(calculerMensuel(['stock', 'fidelite', 'livraisons', 'planning', 'compta']).total).toBe(59);
  });
});
