import { describe, it, expect } from 'vitest';
import {
  parserMessageCloture,
  proposerCloture,
  parserExportWhatsapp,
  extraireClotures,
  trouverEmploye,
  dateDepuisEntete,
} from './whatsapp';

const MESSAGE = `04/09

CA 4046,20

CB 3213,7
Moro 692,5

Chromes

Gaétan +33
Adam +3

Livraisons

+52 Chessy  (Moro)
+52 pote Brahim

Caisse départ
100`;

describe('parserMessageCloture', () => {
  it('lit un message de clôture WhatsApp complet', () => {
    const m = parserMessageCloture(MESSAGE, { dateEnvoi: new Date(2026, 8, 4, 21, 17) });
    expect(m.date).toBe('2026-09-04');
    expect(m.ca).toBe(4046.2);
    expect(m.cb).toBe(3213.7);
    expect(m.especes).toBe(692.5);
    expect(m.fond).toBe(100);
    expect(m.chromes).toEqual([
      { nom: 'Gaétan', montant: 33, type: 'avance' },
      { nom: 'Adam', montant: 3, type: 'avance' },
    ]);
    expect(m.livraisons).toEqual([
      { nom: 'Chessy', montant: 52, mode: 'especes' },
      { nom: 'pote Brahim', montant: 52, mode: 'inconnu' },
    ]);
    expect(m.avertissements).toEqual([]);
  });

  it('accepte des variantes de libellés (espèces, virement, fond de caisse, remboursement)', () => {
    const m = parserMessageCloture(
      '12/08/2026\nCB : 1507,50 €\nEspèces 805\nVirement 135\nFond de caisse 68,5\nChromes\nPaul -20\nLéa 15',
    );
    expect(m.date).toBe('2026-08-12');
    expect(m.cb).toBe(1507.5);
    expect(m.especes).toBe(805);
    expect(m.virements).toBe(135);
    expect(m.fond).toBe(68.5);
    expect(m.chromes).toEqual([
      { nom: 'Paul', montant: 20, type: 'remboursement' },
      { nom: 'Léa', montant: 15, type: 'avance' },
    ]);
  });

  it('renvoie null pour un message qui n’est pas une clôture', () => {
    expect(parserMessageCloture('Salut, quelqu’un peut ouvrir demain ?')).toBeNull();
    expect(parserMessageCloture('')).toBeNull();
  });

  it('signale les lignes non comprises hors section', () => {
    const m = parserMessageCloture('04/09\nCB 100\nBlabla incompréhensible ici');
    expect(m.avertissements).toHaveLength(1);
  });
});

describe('dateDepuisEntete', () => {
  it('prend l’année de l’envoi et bascule sur l’année précédente en janvier', () => {
    expect(dateDepuisEntete('4', '9', undefined, new Date(2026, 8, 5))).toBe('2026-09-04');
    expect(dateDepuisEntete('31', '12', undefined, new Date(2027, 0, 2))).toBe('2026-12-31');
    expect(dateDepuisEntete('04', '09', '26')).toBe('2026-09-04');
    expect(dateDepuisEntete('31', '02', '2026')).toBeNull();
  });
});

describe('proposerCloture', () => {
  it('ventile les livraisons et contrôle le CA annoncé', () => {
    const c = proposerCloture(parserMessageCloture(MESSAGE, { dateEnvoi: new Date(2026, 8, 4) }));
    expect(c.cb).toBe(3213.7);
    expect(c.especes).toBe(744.5); // Moro 692,5 + livraison Chessy 52 (Moro)
    expect(c.virements).toBe(52); // pote Brahim (mode non précisé)
    expect(c.fond_caisse).toBe(100);
    expect(c.caCalcule).toBe(4046.2); // 3213,7 + 744,5 + 52 + 33 + 3
    expect(c.ecart).toBe(0);
    expect(c.chromesMessage).toBe(36);
    expect(c.commentaire).toContain('Chessy');
  });

  it('détecte un écart entre CA annoncé et CA recalculé', () => {
    const c = proposerCloture(parserMessageCloture('04/09\nCA 1000\nCB 600\nMoro 300'));
    expect(c.caCalcule).toBe(900);
    expect(c.ecart).toBe(100);
  });
});

const EXPORT_IOS = `‎[03/09/2026 21:05:12] Adam: 03/09
CA 2000
CB 1500
Moro 500
‎[04/09/2026 21:17:33] Adam: 04/09
CA 100
CB 60
Moro 40
[04/09/2026 21:20:00] Thomas: super merci
[04/09/2026 21:25:00] Adam: 04/09
CA 110
CB 60
Moro 50`;

const EXPORT_ANDROID = `04/09/2026, 21:17 - Adam: 04/09
CA 4046,20
CB 3213,7
Moro 692,5
Chromes
Gaétan +33
04/09/2026, 21:18 - Thomas: 👍`;

describe('parserExportWhatsapp / extraireClotures', () => {
  it('découpe un export iOS et garde la dernière version d’une clôture corrigée', () => {
    expect(parserExportWhatsapp(EXPORT_IOS)).toHaveLength(4);
    const clos = extraireClotures(EXPORT_IOS);
    expect(clos).toHaveLength(2);
    expect(clos[0].message.date).toBe('2026-09-03');
    expect(clos[1].message.date).toBe('2026-09-04');
    expect(clos[1].cloture.especes).toBe(50); // message corrigé (le dernier gagne)
    expect(clos[1].auteur).toBe('Adam');
  });

  it('découpe un export Android', () => {
    const clos = extraireClotures(EXPORT_ANDROID);
    expect(clos).toHaveLength(1);
    expect(clos[0].cloture.cb).toBe(3213.7);
    expect(clos[0].message.chromes).toHaveLength(1);
  });
});

describe('trouverEmploye', () => {
  const employes = [{ nom: 'Adam' }, { nom: 'Kanye Ouest' }, { nom: 'Thomas' }];
  it('rapproche par prénom, sans accent ni casse', () => {
    expect(trouverEmploye('adam', employes).nom).toBe('Adam');
    expect(trouverEmploye('Kanye', employes).nom).toBe('Kanye Ouest');
    expect(trouverEmploye('Thomás', employes).nom).toBe('Thomas');
    expect(trouverEmploye('Inconnu', employes)).toBeNull();
  });
});
