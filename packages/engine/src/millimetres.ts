import { z } from 'zod';

/**
 * Le moteur ne connaît que le millimètre entier.
 *
 * L'impérial est une affaire d'affichage et de saisie, traitée dans une couche dédiée
 * côté interface — jamais ici. Un moteur manipulant des pouces fractionnaires perdrait
 * l'invariant de recomposition, et l'aller-retour d'affichage est lossy de 0,125 mm au
 * 1/16".
 *
 * @see docs/I18N.md §4
 * @see docs/NEFTYA_ENGINE.md
 */
export const millimetres = z
  .number()
  .int('Une cote est un entier de millimètres.')
  .finite();

/** Une cote strictement positive : largeur, hauteur, profondeur, épaisseur. */
export const positiveMillimetres = millimetres.positive();

export type Millimetres = z.infer<typeof millimetres>;

/**
 * Vérifie que les parties recomposent exactement le tout.
 *
 * C'est l'invariant central du moteur : la somme des pièces et des épaisseurs égale la
 * cote hors-tout, au millimètre. Il n'y a pas de marge « pour absorber les arrondis » —
 * une marge rendrait le contrôle incapable de distinguer un arrondi d'un vrai défaut.
 *
 * @see docs/NEFTYA_ENGINE.md §4 « Tolérance : zéro »
 */
export function recomposes(parts: readonly number[], total: number): boolean {
  return parts.reduce((sum, part) => sum + part, 0) === total;
}

/**
 * Répartit `total` en `count` parts entières, le reste allant à la dernière.
 *
 * La division ne tombe pas toujours juste, et le moteur ne produit jamais de cote à
 * virgule. Le reste est absorbé par la dernière part plutôt que réparti, pour que le
 * résultat reste prévisible et reproductible.
 *
 * @see docs/NEFTYA_ENGINE.md §7.3
 */
export function divideEvenly(total: number, count: number): number[] {
  if (!Number.isInteger(total)) {
    throw new RangeError('Le total à répartir doit être un entier de millimètres.');
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('Le nombre de parts doit être un entier positif.');
  }

  const base = Math.floor(total / count);
  const remainder = total - base * count;

  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? base + remainder : base,
  );
}
