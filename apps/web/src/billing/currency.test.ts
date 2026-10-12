import { describe, it, expect } from 'vitest';
import { currenciesOf, currencyFromZone, pickCurrency } from './currency.js';

/**
 * Quelle devise un visiteur voit.
 *
 * Se tromper ici n'affiche pas un prix faux — les montants viennent de l'API — mais
 * affiche **le prix de quelqu'un d'autre**, ce qui fait réfléchir un artisan de Douala
 * devant des euros, ou renonce un menuisier de Lyon devant des francs CFA.
 */

describe('la devise suggérée par le fuseau', () => {
  it('reconnaît la zone franc', () => {
    expect(currencyFromZone('Africa/Douala')).toBe('XAF');
    expect(currencyFromZone('Africa/Libreville')).toBe('XAF');
  });

  it('ne conclut rien ailleurs', () => {
    /*
     * **Et c'est voulu.** Répondre « euro » pour tout ce qui n'est pas la zone franc
     * ferait du Japon et du Canada des pays de la zone euro. Un fuseau qu'on ne connaît
     * pas ne dit rien ; c'est le catalogue qui tranche ensuite.
     */
    expect(currencyFromZone('Europe/Paris')).toBeNull();
    expect(currencyFromZone('America/Toronto')).toBeNull();
    expect(currencyFromZone('Africa/Lagos')).toBeNull();
  });
});

describe('le choix de la devise', () => {
  it('suit l’ordre des indices', () => {
    // Ce que le client a payé passe devant ce qu'il a choisi d'afficher, qui passe devant
    // ce que son fuseau suggère.
    expect(pickCurrency(['EUR', 'XAF'], ['XAF', 'EUR', null])).toBe('XAF');
    expect(pickCurrency(['EUR', 'XAF'], [null, 'EUR', 'XAF'])).toBe('EUR');
    expect(pickCurrency(['EUR', 'XAF'], [null, null, 'XAF'])).toBe('XAF');
  });

  it('écarte un indice qu’aucun encaisseur ne prend', () => {
    /*
     * La garde qui compte. Une organisation dont les réglages disent « USD » — parce que
     * ses devis sont en dollars — ne doit pas voir un bouton de paiement en dollars :
     * aucun encaisseur ne les prend, et le bouton mènerait droit à un refus.
     */
    expect(pickCurrency(['EUR', 'XAF'], ['USD', null, null])).toBe('EUR');
    expect(pickCurrency(['XAF'], ['EUR', 'EUR', 'EUR'])).toBe('XAF');
  });

  it('rend null quand il n’y a rien à vendre', () => {
    // La page dira « bientôt » : un prix affiché sans encaisseur mène à une impasse.
    expect(pickCurrency([], ['EUR', 'XAF', 'XAF'])).toBeNull();
  });
});

describe('les devises d’un catalogue', () => {
  it('les rend une seule fois, dans l’ordre d’apparition', () => {
    // L'ordre vient de l'environnement, et c'est lui qui décide laquelle est proposée en
    // dernier recours : le mélanger rendrait ce dernier recours imprévisible.
    expect(
      currenciesOf([
        { currency: 'EUR' },
        { currency: 'EUR' },
        { currency: 'XAF' },
        { currency: 'EUR' },
      ]),
    ).toEqual(['EUR', 'XAF']);
  });
});
