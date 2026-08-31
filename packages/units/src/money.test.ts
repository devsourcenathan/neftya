import { describe, it, expect } from 'vitest';
import { exponentOf, formatMoney, multiply, parseMoney, sum } from './money.js';

/**
 * Les montants, et le bug déjà commis dans cet écosystème : diviser par cent une devise
 * qui n'a pas de décimale.
 */

describe('exposant ISO 4217', () => {
  it.each([
    ['XAF', 0],
    ['XOF', 0],
    ['EUR', 2],
    ['USD', 2],
    ['TND', 3],
  ])('%s a %i décimales', (currency, exponent) => {
    expect(exponentOf(currency as string)).toBe(exponent);
  });

  it('suppose 2 pour une devise inconnue, sans lever', () => {
    expect(exponentOf('ZZZ')).toBe(2);
  });
});

describe('affichage', () => {
  it('n’ajoute pas de décimales au franc CFA', () => {
    // 150 000 FCFA affichés « 1 500,00 » : le bug que le document nomme.
    const shown = formatMoney({ amount: 150_000, currency: 'XAF' }, 'fr');

    expect(shown).toMatch(/150\s?000/u);
    expect(shown).not.toMatch(/1\s?500,00/u);
  });

  it('en met deux à l’euro', () => {
    expect(formatMoney({ amount: 1000, currency: 'EUR' }, 'fr')).toMatch(/10,00/u);
  });

  it('en met trois au dinar tunisien', () => {
    expect(formatMoney({ amount: 1234, currency: 'TND' }, 'fr')).toMatch(/1,234/u);
  });

  it('suit la locale plutôt qu’un séparateur codé en dur', () => {
    const french = formatMoney({ amount: 123_456, currency: 'EUR' }, 'fr');
    const english = formatMoney({ amount: 123_456, currency: 'EUR' }, 'en');

    expect(french).not.toBe(english);
    expect(english).toContain('1,234.56');
  });
});

describe('saisie', () => {
  it('rend des unités mineures entières', () => {
    expect(parseMoney('12,50', 'EUR')).toEqual({ amount: 1250, currency: 'EUR' });
    expect(parseMoney('15000', 'XAF')).toEqual({ amount: 15_000, currency: 'XAF' });
  });

  it.each(['', 'gratuit', '12,50 €', '1.2.3'])('refuse « %s »', (input) => {
    expect(parseMoney(input, 'EUR')).toBeNull();
  });
});

describe('calcul', () => {
  it('arrondit une fois, à la fin de la multiplication', () => {
    // 7,04 m de chant à 1,99 €/m font 1401 centimes, et non 7 × 199 arrondi ligne à ligne.
    expect(multiply({ amount: 199, currency: 'EUR' }, 7.04)).toEqual({
      amount: 1401,
      currency: 'EUR',
    });
  });

  it('refuse d’additionner deux devises', () => {
    // Une conversion suppose un taux, et un taux inventé au milieu d'un devis ne se voit
    // pas.
    expect(() =>
      sum(
        [
          { amount: 100, currency: 'EUR' },
          { amount: 100, currency: 'XAF' },
        ],
        'EUR',
      ),
    ).toThrow(/devises/u);
  });

  it('additionne des montants de même devise', () => {
    expect(
      sum(
        [
          { amount: 1250, currency: 'EUR' },
          { amount: 1401, currency: 'EUR' },
        ],
        'EUR',
      ),
    ).toEqual({ amount: 2651, currency: 'EUR' });
  });
});
