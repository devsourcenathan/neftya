import { describe, it, expect } from 'vitest';
import { MINIMUM_PLAUSIBLE_MINOR, loadPrices, priceVariable } from './prices.js';

/**
 * Les prix lus de l'environnement.
 *
 * Ce qui se joue ici est une erreur d'unité. Écrire `29` au lieu de `2900` encaisserait
 * vingt-neuf centimes par mois, et personne ne le verrait avant le relevé bancaire — pas
 * l'auteur de la variable, pas le client, pas l'interface, qui afficherait sagement
 * « 0,29 € ». Un prix est le seul réglage dont une faute de frappe ne se voit nulle part.
 */

const PLANS = ['pro', 'professional'];

describe('ce qui est lu', () => {
  it('nomme ses variables en toutes lettres', () => {
    // Le nom est ce qu'on relit dans le tableau de bord d'un hébergeur : il doit se
    // comprendre sans documentation.
    expect(priceVariable('pro', 'EUR', 'monthly')).toBe('NEFTYA_PRICE_PRO_EUR_MONTHLY');
    expect(priceVariable('professional', 'XAF', 'yearly')).toBe(
      'NEFTYA_PRICE_PROFESSIONAL_XAF_YEARLY',
    );
  });

  it('rend les combinaisons posées', () => {
    const prices = loadPrices(
      {
        NEFTYA_PRICE_PRO_EUR_MONTHLY: '2900',
        NEFTYA_PRICE_PRO_XAF_YEARLY: '190000',
      },
      PLANS,
    );

    expect(prices).toEqual([
      { planCode: 'pro', currency: 'EUR', period: 'monthly', amountMinor: 2900 },
      { planCode: 'pro', currency: 'XAF', period: 'yearly', amountMinor: 190000 },
    ]);
  });
});

describe('ce qui est absent', () => {
  it('ne se vend pas, et ce n’est pas une panne', () => {
    /*
     * Tant que le prix en francs CFA n'est pas arrêté, l'offre ne s'y vend pas. Convertir
     * 29 € au taux du jour donnerait un montant que personne n'a décidé, qui bouge tout
     * seul, et qu'il faudrait expliquer à un client.
     */
    const prices = loadPrices({ NEFTYA_PRICE_PRO_EUR_MONTHLY: '2900' }, PLANS);

    expect(prices.filter((price) => price.currency === 'XAF')).toEqual([]);
  });

  it('traite une variable vide comme absente', () => {
    // Un hébergeur rend volontiers une chaîne vide pour une variable qu'on a créée puis
    // effacée. La refuser empêcherait de retirer un prix de la vente.
    expect(loadPrices({ NEFTYA_PRICE_PRO_EUR_MONTHLY: '   ' }, PLANS)).toEqual([]);
  });
});

describe('ce qui est mal formé', () => {
  it('arrête tout plutôt que de retirer l’offre en silence', () => {
    /*
     * `29,00` n'est pas « pas de prix » : c'est quelqu'un qui a voulu en fixer un. Le
     * traiter comme une absence retirerait l'offre de la vente sans le dire, et le défaut
     * se découvrirait en regardant les recettes.
     */
    for (const bad of ['29,00', '29.00', '2 900', 'gratuit', '-2900']) {
      expect(() => loadPrices({ NEFTYA_PRICE_PRO_EUR_MONTHLY: bad }, PLANS)).toThrow(
        /NEFTYA_PRICE_PRO_EUR_MONTHLY/u,
      );
    }
  });

  it('refuse un montant qui trahit une erreur d’unité', () => {
    // `29` au lieu de `2900` : le produit encaisserait vingt-neuf centimes par mois, et
    // l'interface afficherait sagement « 0,29 € ».
    expect(() => loadPrices({ NEFTYA_PRICE_PRO_EUR_MONTHLY: '29' }, PLANS)).toThrow(
      /unité majeure/u,
    );

    expect(() =>
      loadPrices(
        { NEFTYA_PRICE_PRO_EUR_MONTHLY: String(MINIMUM_PLAUSIBLE_MINOR) },
        PLANS,
      ),
    ).not.toThrow();
  });

  it('cite la variable fautive, pas seulement la valeur', () => {
    // Huit variables se ressemblent. Un message qui dirait « prix invalide » obligerait à
    // les ouvrir une par une.
    expect(() =>
      loadPrices({ NEFTYA_PRICE_PROFESSIONAL_XAF_MONTHLY: '79.00' }, PLANS),
    ).toThrow(/NEFTYA_PRICE_PROFESSIONAL_XAF_MONTHLY/u);
  });
});
