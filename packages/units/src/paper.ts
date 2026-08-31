/**
 * La taille du papier.
 *
 * Un plan technique imprimé sur le mauvais format est **mis à l'échelle par
 * l'imprimante**, et les cotes deviennent fausses à la règle. Ce n'est pas un détail de
 * confort : c'est la différence entre un plan qu'on mesure et un plan qu'on ne peut que
 * lire.
 *
 * @see docs/I18N.md §8
 */

export type PaperSize = 'a4' | 'letter';

export interface PaperFormat {
  /** En points PostScript (1/72 pouce), l'unité du PDF. */
  widthPt: number;
  heightPt: number;
}

export const PAPER_FORMATS: Record<PaperSize, PaperFormat> = {
  // 210 × 297 mm.
  a4: { widthPt: 595.28, heightPt: 841.89 },
  // 8,5 × 11 pouces.
  letter: { widthPt: 612, heightPt: 792 },
};

/**
 * Les pays qui impriment sur Letter. Partout ailleurs, A4.
 *
 * La liste est courte et nommée, plutôt qu'une exception codée sur « US » : le Canada, le
 * Mexique et les Philippines l'utilisent aussi, et l'oublier fait dérailler l'échelle chez
 * eux sans que personne ne comprenne pourquoi.
 */
const LETTER_COUNTRIES = new Set([
  'US',
  'CA',
  'MX',
  'PH',
  'CL',
  'CO',
  'CR',
  'DO',
  'GT',
  'VE',
]);

/** `null` — « suivre la plateforme » — donne A4, le format du plus grand nombre. */
export function paperSizeFor(country: string | null): PaperSize {
  return country && LETTER_COUNTRIES.has(country.toUpperCase()) ? 'letter' : 'a4';
}
