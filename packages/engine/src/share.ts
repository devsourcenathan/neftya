import { divideEvenly } from './millimetres.js';

/**
 * Partager un espace entre des cases dont certaines ont une taille imposée.
 *
 * ## Le même problème, deux fois
 *
 * Les compartiments se partagent la largeur intérieure ; les espaces entre étagères se
 * partagent la hauteur d'un compartiment. C'est la même règle mot pour mot — une taille
 * imposée est honorée, le reste se divise également entre les autres — et l'écrire deux
 * fois, c'est la voir diverger le jour où l'une des deux est corrigée.
 *
 * ## Ce qui ne se rattrape pas en silence
 *
 * **Les tailles imposées dépassent la place.** Les souples reçoivent alors zéro, ce que
 * les contrôles de construction voient déjà — une ouverture nulle ne produit pas de pièce.
 * Leur donner des tailles négatives produirait une liste de découpe fausse.
 *
 * **Tout est imposé et la somme ne tombe pas juste.** La dernière case absorbe l'écart :
 * l'espace total fait foi. C'est la largeur qu'on a mesurée contre un mur, ou la hauteur
 * du caisson qu'on a déjà sciée.
 *
 * @see docs/NEFTYA_ENGINE.md §7.3
 */

export interface Share {
  sizes: number[];
  /** Vrai quand les tailles imposées ne tombent pas juste : à l'appelant de le signaler. */
  mismatch: boolean;
  /** La somme demandée, pour que l'avertissement puisse la citer. */
  requestedMm: number;
}

/**
 * @param requested Une entrée par case. `null` ou `undefined` : la case est souple. Les
 * entrées au-delà de `count` sont ignorées — un tableau devenu trop long parce qu'on a
 * retiré une étagère ne doit pas fausser le partage.
 */
export function shareSpace(
  requested: readonly (number | null | undefined)[],
  count: number,
  totalMm: number,
): Share {
  const fixed: (number | null)[] = Array.from(
    { length: count },
    (_, index) => requested[index] ?? null,
  );
  const flexible = fixed.filter((size) => size === null).length;

  if (flexible === count) {
    return { sizes: divideEvenly(totalMm, count), mismatch: false, requestedMm: 0 };
  }

  const requestedMm = fixed.reduce<number>((total, size) => total + (size ?? 0), 0);
  const remaining = totalMm - requestedMm;

  /*
   * Les tailles imposées dépassent à elles seules l'espace disponible.
   *
   * Il n'y a alors rien à honorer : les respecter poserait une étagère **hors du caisson**
   * — vérifié, une hauteur de 3 × 900 dans un meuble de 2000 plaçait la troisième à
   * 2754 mm. On revient à la division égale, qui produit un meuble constructible, et on le
   * signale.
   *
   * Réduire les tailles au prorata serait pire : chacune deviendrait un nombre que
   * personne n'a saisi, et l'écart passerait inaperçu.
   */
  if (remaining < 0) {
    return { sizes: divideEvenly(totalMm, count), mismatch: true, requestedMm };
  }

  if (flexible === 0) {
    const sizes = fixed.map((size) => size as number);
    const mismatch = remaining !== 0;

    // L'espace total fait foi : la dernière case absorbe l'écart plutôt que de laisser un
    // vide à l'intérieur du meuble.
    if (mismatch) sizes[sizes.length - 1] = (sizes.at(-1) as number) + remaining;

    return { sizes, mismatch, requestedMm };
  }

  const share = divideEvenly(Math.max(0, remaining), flexible);
  let next = 0;

  return {
    sizes: fixed.map((size) => size ?? (share[next++] as number)),
    // Moins d'un millimètre par case souple : elles ne tiennent plus.
    mismatch: remaining < flexible,
    requestedMm,
  };
}
