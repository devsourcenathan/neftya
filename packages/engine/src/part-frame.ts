import type { Part, Placement } from './parts.js';

/**
 * Le repère d'une pièce découpée, et son rattachement au meuble.
 *
 * Une `Part` porte des cotes normalisées — la plus grande dimension d'abord — et ses
 * instances portent des positions dans le meuble. **Les deux ne se déduisent pas l'une de
 * l'autre sans regarder.** Un côté de 1764 × 400 a sa longueur dans la hauteur du meuble ;
 * un côté de caisson bas et profond, 400 × 600, l'a dans la profondeur. Supposer l'un ou
 * l'autre suffit à percer une porte de dressing à l'horizontale.
 *
 * Ce module fait la correspondance **par la géométrie de l'instance**, jamais par le rôle.
 *
 * @see docs/NEFTYA_ENGINE.md §12.1
 */

export type Axis = 'x' | 'y' | 'z';

const AXES: readonly Axis[] = ['x', 'y', 'z'];

export interface PartFrame {
  /** Axe du meuble que suit `lengthMm`, et sens de `xMm` dans le repère de la pièce. */
  lengthAxis: Axis;
  /** Axe du meuble que suit `widthMm`, et sens de `yMm`. */
  widthAxis: Axis;
  /** Axe de l'épaisseur : celui qu'un foret traverse. */
  throughAxis: Axis;
  /** Coin de la pièce dans le meuble, au minimum des trois axes. */
  originMm: Record<Axis, number>;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
}

/**
 * De quelle face on perce.
 *
 * **Les coordonnées d'un trou sont toujours dans le repère de la face qu'on perce.** Un
 * trou à 50 mm du bord vu de face est à 50 mm de l'autre bord vu de dos ; donner une seule
 * coordonnée pour les deux faces obligerait l'atelier à faire ce miroir de tête, et c'est
 * l'erreur qu'on fait une fois sur deux.
 *
 * `front` est la face qui regarde le **minimum** de l'axe traversant. Ce n'est ni
 * l'intérieur ni l'extérieur : c'est une définition géométrique, et elle vaut instance par
 * instance — les deux côtés d'un caisson n'ont pas leur face de référence du même côté.
 */
export type HoleSide =
  | 'front'
  | 'back'
  /** Chant : `xMm` court le long du chant, `yMm` se mesure depuis la face `front`. */
  | 'edge_x_min'
  | 'edge_x_max'
  | 'edge_y_min'
  | 'edge_y_max';

/**
 * Le repère d'une instance.
 *
 * L'axe traversant est celui dont l'encombrement vaut l'épaisseur **et** dont les deux
 * autres redonnent la longueur et la largeur. Chercher seulement l'épaisseur ne suffit
 * pas : une pièce de 18 mm d'épaisseur et 18 mm de large en a deux.
 */
export function frameOf(part: Part, instance: Placement): PartFrame {
  const sizes: Record<Axis, number> = {
    x: instance.sizeXMm,
    y: instance.sizeYMm,
    z: instance.sizeZMm,
  };
  const origin: Record<Axis, number> = {
    x: instance.xMm,
    y: instance.yMm,
    z: instance.zMm,
  };

  const through =
    AXES.find((axis) => sizes[axis] === part.thicknessMm && restMatches(sizes, axis, part)) ??
    AXES.find((axis) => sizes[axis] === part.thicknessMm);

  if (!through) {
    throw new Error(
      `L'instance de ${part.id} n'a aucun axe à l'épaisseur ${part.thicknessMm}.`,
    );
  }

  const rest = AXES.filter((axis) => axis !== through);
  const lengthAxis =
    rest.find((axis) => sizes[axis] === part.lengthMm) ?? (rest[0] as Axis);
  const widthAxis = rest.find((axis) => axis !== lengthAxis) as Axis;

  return {
    lengthAxis,
    widthAxis,
    throughAxis: through,
    originMm: origin,
    lengthMm: part.lengthMm,
    widthMm: part.widthMm,
    thicknessMm: part.thicknessMm,
  };
}

function restMatches(sizes: Record<Axis, number>, through: Axis, part: Part): boolean {
  const rest = AXES.filter((axis) => axis !== through).map((axis) => sizes[axis]);
  const wanted = [part.lengthMm, part.widthMm];

  return (
    (rest[0] === wanted[0] && rest[1] === wanted[1]) ||
    (rest[0] === wanted[1] && rest[1] === wanted[0])
  );
}

/**
 * Un point du meuble, ramené au repère d'une face de la pièce.
 *
 * Sur `back`, `xMm` est **déjà** compté depuis l'autre bord : c'est ce qu'on mesure une
 * fois la pièce retournée sur l'établi.
 */
export function toPartFrame(
  frame: PartFrame,
  point: Record<Axis, number>,
  side: 'front' | 'back',
): { xMm: number; yMm: number } {
  const along = point[frame.lengthAxis] - frame.originMm[frame.lengthAxis];
  const across = point[frame.widthAxis] - frame.originMm[frame.widthAxis];

  return {
    xMm: side === 'front' ? along : frame.lengthMm - along,
    yMm: across,
  };
}

/**
 * La face de la pièce qui regarde une coordonnée donnée de l'axe traversant.
 *
 * C'est la question que pose tout perçage d'assemblage : « de quel côté est le voisin ? ».
 */
export function facingSide(frame: PartFrame, neighbourMm: number): 'front' | 'back' {
  const centre = frame.originMm[frame.throughAxis] + frame.thicknessMm / 2;
  return neighbourMm < centre ? 'front' : 'back';
}
