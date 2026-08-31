/**
 * Les montants.
 *
 * **Tout montant est un entier dans l'unité mineure de sa devise, et porte toujours sa
 * devise.** Jamais un flottant : 0,1 + 0,2 ne vaut pas 0,3, et un devis qui tombe à un
 * centime près est un devis faux.
 *
 * **Ne jamais supposer une division par 100.** L'exposant vient de la table ISO 4217. Sur
 * le marché visé, XOF et XAF ont zéro décimale : afficher 150 000 FCFA comme « 1 500,00 »
 * est un bug qui a déjà été commis dans cet écosystème.
 *
 * @see docs/I18N.md §5
 */

export interface Money {
  /** Unités mineures. 1000 en EUR vaut 10,00 € ; 1000 en XAF vaut 1 000 FCFA. */
  amount: number;
  /** Code ISO 4217. Un montant sans devise n'a pas de sens. */
  currency: string;
}

/**
 * Les devises dont l'exposant n'est pas 2.
 *
 * La table est courte parce que 2 est le cas général — mais les exceptions sont
 * précisément celles du marché visé, et les oublier fait passer un devis pour cent fois
 * son montant.
 */
const EXPONENTS: Record<string, number> = {
  XOF: 0,
  XAF: 0,
  JPY: 0,
  KRW: 0,
  CLP: 0,
  ISK: 0,
  VND: 0,
  RWF: 0,
  UGX: 0,
  GNF: 0,
  DJF: 0,
  KMF: 0,
  BIF: 0,
  MGA: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
};

export function exponentOf(currency: string): number {
  return EXPONENTS[currency.toUpperCase()] ?? 2;
}

export function formatMoney(money: Money, locale = 'fr'): string {
  const exponent = exponentOf(money.currency);

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(money.amount / 10 ** exponent);
}

/**
 * Interprète un prix saisi et rend des unités mineures **entières**.
 *
 * Rend `null` sur ce qui n'est pas un nombre : un prix deviné est un devis faux.
 */
export function parseMoney(input: string, currency: string): Money | null {
  const text = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;

  const exponent = exponentOf(currency);

  return { amount: Math.round(Number(text) * 10 ** exponent), currency };
}

/**
 * Prix unitaire × quantité, en unités mineures entières.
 *
 * L'arrondi est fait **une fois, à la fin** de la multiplication. Arrondir chaque ligne
 * avant d'additionner décale le total, et c'est le total que le client paie.
 */
export function multiply(unitPrice: Money, quantity: number): Money {
  return {
    amount: Math.round(unitPrice.amount * quantity),
    currency: unitPrice.currency,
  };
}

/**
 * Additionne des montants de **même** devise.
 *
 * Mélanger deux devises lève : une conversion suppose un taux, et un taux inventé au
 * milieu d'un devis ne se voit pas.
 */
export function sum(amounts: readonly Money[], currency: string): Money {
  let total = 0;

  for (const money of amounts) {
    if (money.currency !== currency) {
      throw new Error(
        `Montants de devises différentes : ${money.currency} et ${currency}.`,
      );
    }
    total += money.amount;
  }

  return { amount: total, currency };
}
