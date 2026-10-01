import { describe, it, expect } from 'vitest';
import { messageErreur } from './erreurs';

describe('messageErreur', () => {
  it('traduit les codes PostgreSQL courants', () => {
    expect(messageErreur({ code: '23505', message: 'duplicate key value violates unique constraint' })).toMatch(/doublon/);
    expect(messageErreur({ code: '23514', message: 'new row violates check constraint' })).toMatch(/refusée/);
    expect(messageErreur({ code: '42501', message: 'permission denied' })).toMatch(/non autorisée/);
  });
  it('reconnaît la RLS et le réseau', () => {
    expect(messageErreur({ message: 'new row violates row-level security policy for table "chromes"' })).toMatch(/non autorisée/);
    expect(messageErreur({ message: 'TypeError: Failed to fetch' })).toMatch(/connexion/);
  });
  it('conserve un message français lisible venant d’une fonction SQL', () => {
    expect(messageErreur({ message: 'Produit introuvable' })).toBe('Produit introuvable');
    expect(messageErreur({ message: 'Les inscriptions sont fermées pour ce magasin.' })).toMatch(/fermées/);
  });
  it('retombe sur un message générique pour le reste', () => {
    expect(messageErreur({ message: 'relation "x_y" does not exist' })).toMatch(/réessaie/);
    expect(messageErreur(null)).toMatch(/réessaie/);
  });
});
