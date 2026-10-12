/**
 * Ce que l'annuel fait gagner, et comment le dire.
 *
 * **L'annuel n'était affiché nulle part sur la page d'accueil.** `priceLabel` ne gardait
 * que le mensuel, si bien que le seul vrai levier commercial du produit — deux mois
 * offerts sur douze — restait invisible jusqu'à ce qu'un visiteur crée un compte et
 * atteigne la facturation. Personne ne crée un compte pour découvrir un prix.
 *
 * L'avantage est **calculé des prix réels**, jamais écrit à la main : les montants vivent
 * dans l'environnement, et une remise annoncée en dur mentirait au premier changement de
 * tarif. Et il n'est annoncé que s'il existe — un annuel au prix de douze mensualités ne
 * porte aucune promesse, et prétendre le contraire se vérifie en une division.
 */

export type YearlyAdvantage =
  /** Un compte rond : « deux mois offerts » se comprend sans calcul. */
  | { kind: 'months'; months: number }
  /** Sinon le pourcentage, qui reste vrai pour n'importe quel rapport. */
  | { kind: 'percent'; percent: number };

/**
 * L'avantage de l'annuel sur douze mensualités, ou `null` s'il n'y en a pas.
 *
 * Les deux montants doivent être dans la **même devise** : comparer des centimes d'euro à
 * des francs CFA donnerait un rapport sans signification. L'appelant les choisit dans une
 * seule devise, et c'est pour ça que ce module n'en connaît aucune.
 */
export function yearlyAdvantage(
  monthlyMinor: number,
  yearlyMinor: number,
): YearlyAdvantage | null {
  if (monthlyMinor <= 0) return null;

  const twelve = monthlyMinor * 12;
  const saved = twelve - yearlyMinor;

  if (saved <= 0) return null;

  const months = saved / monthlyMinor;

  if (Number.isInteger(months)) return { kind: 'months', months };

  /*
   * Arrondi à l'entier, et jamais vers le haut par hasard : `Math.round` sur un gain de
   * 16,7 % donne 17 %, ce qui est la façon dont on l'écrirait à la main. Un arrondi
   * optimiste — 16,2 % annoncé « 17 % » — serait une publicité, pas une information.
   */
  return { kind: 'percent', percent: Math.round((saved / twelve) * 100) };
}

/**
 * Le prix mensuel équivalent d'un abonnement annuel.
 *
 * « 290 €/an » et « 29 €/mois » ne se comparent pas de tête, et le visiteur qui essaie se
 * trompe aussi souvent qu'il réussit. On compare donc ce qui est comparable.
 *
 * La division peut ne pas tomber juste : `formatMoney` arrondit à l'affichage, et c'est le
 * bon endroit — le montant débité reste celui de l'environnement, pas celui-ci.
 */
export function monthlyEquivalent(yearlyMinor: number): number {
  return Math.round(yearlyMinor / 12);
}
