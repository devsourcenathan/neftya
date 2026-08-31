import type { Millimetres } from '@neftya/engine';

/**
 * L'impérial, en fractions.
 *
 * Un menuisier impérial lit `34 3/8"` sur son mètre, pas `34.37"`. La décimale est
 * illisible sur un atelier, et personne ne la reporte sur une pièce de bois.
 *
 * @see docs/I18N.md §4
 */

export const MM_PER_INCH = 25.4;

/** Le seizième est la graduation du mètre de menuisier. */
export const DEFAULT_DENOMINATOR = 16;

export interface ImperialLength {
  /** Pouces entiers. */
  readonly whole: number;
  /** Numérateur de la fraction, déjà réduit. `0` quand la cote tombe juste. */
  readonly numerator: number;
  /** Dénominateur réduit : `6/16` devient `3/8`. */
  readonly denominator: number;
  readonly negative: boolean;
  /**
   * Ce que la valeur affichée revaut en millimètres, moins la valeur d'origine.
   *
   * **C'est la perte de l'aller-retour, et elle est exposée, pas masquée.** 873 mm
   * s'affiche `34 3/8"`, qui revaut 873,125 mm.
   */
  readonly errorMm: number;
}

/**
 * Convertit pour **afficher**. Ne produit jamais une valeur destinée au modèle.
 *
 * @see docs/I18N.md §4 — « convertir pour afficher ne modifie jamais le modèle »
 */
export function toImperial(
  valueMm: number,
  denominator: number = DEFAULT_DENOMINATOR,
): ImperialLength {
  const negative = valueMm < 0;
  const inches = Math.abs(valueMm) / MM_PER_INCH;

  const totalSixteenths = Math.round(inches * denominator);
  const whole = Math.floor(totalSixteenths / denominator);
  let numerator = totalSixteenths % denominator;
  let reduced = denominator;

  // Réduction : 6/16 se lit 3/8, et un mètre ne porte pas de graduation « 6/16 ».
  while (numerator > 0 && numerator % 2 === 0 && reduced % 2 === 0) {
    numerator /= 2;
    reduced /= 2;
  }
  if (numerator === 0) reduced = 1;

  const displayedMm = (whole + numerator / reduced) * MM_PER_INCH;

  return {
    whole,
    numerator,
    denominator: reduced,
    negative,
    errorMm: (negative ? -displayedMm : displayedMm) - valueMm,
  };
}

/** `34 3/8"`, ou `34"` quand la cote tombe juste. */
export function formatImperial(
  valueMm: number,
  denominator: number = DEFAULT_DENOMINATOR,
): string {
  const {
    whole,
    numerator,
    denominator: reduced,
    negative,
  } = toImperial(valueMm, denominator);
  const sign = negative ? '-' : '';

  if (numerator === 0) return `${sign}${whole}"`;
  if (whole === 0) return `${sign}${numerator}/${reduced}"`;

  return `${sign}${whole} ${numerator}/${reduced}"`;
}

/**
 * Un écart d'arrondi notable mérite d'être signalé.
 *
 * Ce n'est pas une erreur : c'est la nature de l'impérial. Mais un menuisier qui coupe à
 * la cote affichée doit savoir que le modèle dit autre chose.
 *
 * **Le seuil n'est pas le demi-seizième qu'annonçait [I18N.md](../../../docs/I18N.md).**
 * Arrondir au plus proche borne l'erreur à exactement un demi-pas ; un seuil posé là ne se
 * déclencherait que sur une égalité parfaite, et ne signalerait donc rien. Le quart de pas
 * — 0,397 mm au seizième — désigne les cotes qui tombent vraiment entre deux graduations.
 */
export function roundingIsNotable(
  valueMm: number,
  denominator: number = DEFAULT_DENOMINATOR,
): boolean {
  const quarterStepMm = MM_PER_INCH / denominator / 4;
  return Math.abs(toImperial(valueMm, denominator).errorMm) > quarterStepMm;
}

/**
 * Interprète une saisie impériale.
 *
 * Accepte `34 3/8`, `34-3/8`, `3/8`, `34.375` et `34`. Rend `null` sur ce qu'elle ne
 * comprend pas : deviner produirait une cote fausse sans que personne ne le voie.
 */
export function parseImperial(input: string): number | null {
  const text = input.trim().replace(/["″]/g, '').trim();
  if (text === '') return null;

  const negative = text.startsWith('-');
  const body = negative ? text.slice(1).trim() : text;

  // `34 3/8` ou `34-3/8`
  const mixed = /^(\d+)\s*[-\s]\s*(\d+)\s*\/\s*(\d+)$/.exec(body);
  if (mixed) {
    const inches = signed(numberOf(mixed[1]) + fraction(mixed[2], mixed[3]), negative);
    return Number.isFinite(inches) ? inches : null;
  }

  // `3/8`
  const pure = /^(\d+)\s*\/\s*(\d+)$/.exec(body);
  if (pure) {
    const inches = signed(fraction(pure[1], pure[2]), negative);
    return Number.isFinite(inches) ? inches : null;
  }

  // `34` ou `34.375`
  const decimal = /^(\d+(?:[.,]\d+)?)$/.exec(body);
  if (decimal) {
    return signed(Number((decimal[1] as string).replace(',', '.')), negative);
  }

  return null;
}

function fraction(
  numerator: string | undefined,
  denominator: string | undefined,
): number {
  const bottom = numberOf(denominator);
  // `3/0` : refusé plus haut par le `Number.isFinite` de l'appelant.
  return bottom === 0 ? Number.NaN : numberOf(numerator) / bottom;
}

function numberOf(value: string | undefined): number {
  return Number(value ?? Number.NaN);
}

function signed(inches: number, negative: boolean): number {
  return negative ? -inches : inches;
}

/** Le retour vers le modèle : millimètres **entiers**, toujours. */
export function inchesToMillimetres(inches: number): Millimetres {
  return Math.round(inches * MM_PER_INCH) as Millimetres;
}
