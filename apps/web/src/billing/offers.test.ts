import { describe, it, expect } from 'vitest';
import { monthlyEquivalent, yearlyAdvantage } from './offers.js';

/**
 * Ce qu'on a le droit d'annoncer sur l'annuel.
 *
 * Une remise est une promesse chiffrée : si elle est fausse, elle est fausse pour tout le
 * monde, sur la page d'accueil, et pour toujours. Ces tests tiennent la seule règle qui
 * compte — **on n'annonce que ce que les prix disent**.
 */

describe('l’avantage de l’annuel', () => {
  it('compte en mois quand la division tombe juste', () => {
    // Les prix réels du produit : 2 900 par mois, 29 000 par an. Deux mois offerts.
    expect(yearlyAdvantage(2900, 29000)).toEqual({ kind: 'months', months: 2 });
    expect(yearlyAdvantage(19000, 190000)).toEqual({ kind: 'months', months: 2 });
  });

  it('bascule sur un pourcentage quand elle ne tombe pas juste', () => {
    /*
     * Le jour où un tarif annuel sera décidé sans égard pour les mensualités, « deux mois
     * offerts » deviendrait faux. Le pourcentage, lui, reste vrai pour n'importe quel
     * rapport — et c'est la raison d'avoir deux formes plutôt qu'une.
     */
    expect(yearlyAdvantage(1000, 11500)).toEqual({ kind: 'percent', percent: 4 });
  });

  it('n’annonce rien quand il n’y a rien à annoncer', () => {
    /*
     * **La garde qui empêche une publicité mensongère.** Un annuel au prix de douze
     * mensualités ne porte aucune promesse ; un annuel plus cher en porte une négative.
     * Dans les deux cas la page doit se taire, et non afficher « 0 % » ou « −2 mois ».
     */
    expect(yearlyAdvantage(2900, 34800)).toBeNull();
    expect(yearlyAdvantage(2900, 40000)).toBeNull();

    // Un mensuel absent ou nul ne permet aucune comparaison : surtout pas une division.
    expect(yearlyAdvantage(0, 29000)).toBeNull();
  });
});

describe('le mensuel équivalent', () => {
  it('ramène l’annuel au mois, pour que la comparaison soit possible', () => {
    expect(monthlyEquivalent(29000)).toBe(2417);
    expect(monthlyEquivalent(190000)).toBe(15833);
  });
});
