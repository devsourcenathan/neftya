import { YOUNG_MODULUS, type MaterialKey } from './materials.js';

/**
 * Flèche d'une étagère sur appuis simples, uniformément chargée.
 *
 *     δ = 5 · w · L⁴ / (384 · E · I)        avec  I = b · h³ / 12
 *
 * L'objectif n'est pas de remplacer un menuisier, mais d'éviter l'erreur la plus
 * courante : une étagère trop longue ou trop fine, qui fléchit visiblement sous la
 * charge.
 *
 * C'est le seul endroit du moteur où l'on manipule des réels — une flèche est une
 * grandeur physique, pas une cote de découpe. Aucune valeur calculée ici ne redescend
 * dans une dimension.
 *
 * @see docs/NEFTYA_ENGINE.md §9
 */

const GRAVITY_M_S2 = 9.81;

/** Au-delà de la portée divisée par ce nombre, la flèche se voit. */
export const DEFLECTION_LIMIT_RATIO = 300;

export interface DeflectionResult {
  /** Flèche au centre, en millimètres. */
  deflectionMm: number;
  /** Flèche admissible, `L / 300`. */
  limitMm: number;
  excessive: boolean;
}

export function shelfDeflection(options: {
  spanMm: number;
  depthMm: number;
  thicknessMm: number;
  material: MaterialKey;
  loadKg: number;
}): DeflectionResult {
  const { spanMm, depthMm, thicknessMm, material, loadKg } = options;

  const momentOfInertia = (depthMm * thicknessMm ** 3) / 12;
  const youngModulus = YOUNG_MODULUS[material];
  const loadPerMm = (loadKg * GRAVITY_M_S2) / spanMm;

  const deflectionMm =
    (5 * loadPerMm * spanMm ** 4) / (384 * youngModulus * momentOfInertia);
  const limitMm = spanMm / DEFLECTION_LIMIT_RATIO;

  return { deflectionMm, limitMm, excessive: deflectionMm > limitMm };
}
