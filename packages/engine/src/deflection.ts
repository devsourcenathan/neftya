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

/**
 * Que faire d'une étagère qui plie.
 *
 * **« Réduisez la portée ou augmentez l'épaisseur » ne dit rien à qui débute.** Réduire de
 * combien ? Augmenter jusqu'où ? L'avertissement nommait le remède sans donner la dose, et
 * une consigne qu'on ne peut pas suivre vaut un silence.
 *
 * Les deux sorties sont calculées par la même fonction que la flèche — pas estimées, pas
 * tabulées : on cherche la première épaisseur du catalogue qui passe, et la portée à
 * laquelle l'épaisseur actuelle passerait. Les deux sont des chiffres qu'on peut appliquer
 * tels quels.
 *
 * La troisième sortie est toujours vraie et n'a pas de chiffre : poser un montant au milieu
 * divise la portée par deux, et la flèche par seize — la portée est à la puissance quatre.
 * C'est le remède que le menuisier emploie, et celui auquel personne ne pense.
 */
export interface DeflectionRemedy {
  /** La première épaisseur du catalogue qui tienne, ou `null` si aucune n'y suffit. */
  thicknessMm: number | null;
  /** La portée maximale à épaisseur inchangée, arrondie au millimètre inférieur. */
  maxSpanMm: number;
}

export function deflectionRemedy(options: {
  spanMm: number;
  depthMm: number;
  thicknessMm: number;
  material: MaterialKey;
  loadKg: number;
  /** Les épaisseurs disponibles, croissantes. Celles du système d'unités du projet. */
  thicknessesMm: readonly number[];
}): DeflectionRemedy {
  const { thicknessesMm, ...shelf } = options;

  const thicknessMm =
    thicknessesMm
      .filter((candidate) => candidate > shelf.thicknessMm)
      .sort((a, b) => a - b)
      .find(
        (candidate) => !shelfDeflection({ ...shelf, thicknessMm: candidate }).excessive,
      ) ?? null;

  /*
   * La portée maximale, par bissection.
   *
   * La flèche croît comme `L⁴` et la limite comme `L` : le rapport est monotone, donc une
   * bissection converge et n'a pas de minimum local où se perdre. Résoudre en fermé serait
   * possible, et ce serait une seconde formule à garder d'accord avec `shelfDeflection` —
   * c'est exactement ce qui finit par diverger.
   */
  let low = 0;
  let high = shelf.spanMm;

  for (let step = 0; step < 40; step += 1) {
    const middle = (low + high) / 2;
    if (shelfDeflection({ ...shelf, spanMm: middle }).excessive) high = middle;
    else low = middle;
  }

  return { thicknessMm, maxSpanMm: Math.floor(low) };
}
