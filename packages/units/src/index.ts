import type { Millimetres } from '@neftya/engine';
import { formatImperial, inchesToMillimetres, parseImperial } from './imperial.js';

/**
 * La couche d'unités.
 *
 * ```text
 * saisie  →  conversion  →  moteur (mm entiers)  →  conversion  →  affichage
 * ```
 *
 * Elle est **hors du moteur**, délibérément : le moteur calcule en millimètres entiers,
 * toujours, et un moteur qui manipulerait des pouces fractionnaires perdrait l'invariant
 * de recomposition. Ici, les unités ne sont qu'une affaire d'affichage et de saisie.
 *
 * @see docs/I18N.md §4
 */

export type UnitSystem = 'metric' | 'imperial';

export const UNIT_SYSTEMS: readonly UnitSystem[] = ['metric', 'imperial'];

/**
 * Formate une longueur pour l'affichage.
 *
 * En impérial, le résultat est **lossy** : 873 mm s'affiche `34 3/8"`, qui revaut
 * 873,125 mm. C'est pourquoi rien de ce que rend cette fonction ne doit revenir dans le
 * modèle. Seule une saisie explicite reconvertit, par `parseLength`.
 */
export function formatLength(
  valueMm: number,
  system: UnitSystem,
  locale = 'fr',
): string {
  if (system === 'imperial') return formatImperial(valueMm);

  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(valueMm)} mm`;
}

/**
 * Interprète une saisie utilisateur et rend des **millimètres entiers**.
 *
 * `873mm` reste 873 mm quel que soit le système choisi : un utilisateur qui écrit son
 * unité sait ce qu'il veut, et la lui traduire serait une trahison silencieuse.
 *
 * Rend `null` sur une saisie incomprise, jamais une valeur devinée.
 */
export function parseLength(input: string, system: UnitSystem): Millimetres | null {
  const text = input.trim();
  if (text === '') return null;

  const explicitMm = /^(-?\d+(?:[.,]\d+)?)\s*mm$/i.exec(text);
  if (explicitMm) {
    return Math.round(
      Number((explicitMm[1] as string).replace(',', '.')),
    ) as Millimetres;
  }

  if (system === 'imperial') {
    const inches = parseImperial(text);
    return inches === null ? null : inchesToMillimetres(inches);
  }

  const metric = /^-?\d+(?:[.,]\d+)?$/.exec(text);
  return metric ? (Math.round(Number(text.replace(',', '.'))) as Millimetres) : null;
}

/** Le pas d'un curseur, dans le système courant, exprimé en millimètres. */
export function stepFor(system: UnitSystem): number {
  // Un seizième de pouce vaut 1,5875 mm ; le pas entier le plus proche est 2 mm, et il
  // évite qu'un curseur impérial saute d'une graduation à l'autre sans s'y arrêter.
  return system === 'imperial' ? 2 : 1;
}

export {
  DEFAULT_DENOMINATOR,
  formatImperial,
  inchesToMillimetres,
  parseImperial,
  roundingIsNotable,
  MM_PER_INCH,
  toImperial,
  type ImperialLength,
} from './imperial.js';
