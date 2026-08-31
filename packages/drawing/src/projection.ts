import type { Furniture, Part, Placement } from '@neftya/engine';

/**
 * La projection orthogonale.
 *
 * Le modèle est composé de boîtes alignées sur les axes : la projection est donc directe,
 * et n'appelle aucune bibliothèque de CAO. Chaque pièce devient un rectangle, et son
 * identifiant le suit — celui-là même que le menuisier lira sur la liste de découpe.
 *
 * @see docs/VISUALIZATION.md §3
 */

export type ViewName = 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';

export const VIEWS: readonly ViewName[] = [
  'front',
  'back',
  'top',
  'bottom',
  'left',
  'right',
];

/** Un rectangle projeté, dans le repère de la vue. Origine en bas à gauche. */
export interface ProjectedRect {
  partId: string;
  role: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  /** Profondeur dans l'axe de regard : sert à ordonner le tracé, pas à coter. */
  depthMm: number;
}

export interface Projection {
  view: ViewName;
  widthMm: number;
  heightMm: number;
  rects: ProjectedRect[];
}

/**
 * Projette le meuble sur une vue.
 *
 * Les pièces sont triées de la plus lointaine à la plus proche, pour que le tracé donne
 * l'ordre attendu quand deux pièces se superposent. Aucune n'est retirée : un plan
 * technique montre la structure, pas une photographie.
 */
export function project(furniture: Furniture, view: ViewName): Projection {
  const { widthMm, heightMm, depthMm } = furniture.input.dimensions;

  const rects = furniture.parts
    .flatMap((part) =>
      part.instances.map((placement) => projectOne(part, placement, view, furniture)),
    )
    .sort((a, b) => b.depthMm - a.depthMm);

  const size = {
    front: { width: widthMm, height: heightMm },
    back: { width: widthMm, height: heightMm },
    top: { width: widthMm, height: depthMm },
    bottom: { width: widthMm, height: depthMm },
    left: { width: depthMm, height: heightMm },
    right: { width: depthMm, height: heightMm },
  }[view];

  return { view, widthMm: size.width, heightMm: size.height, rects };
}

function projectOne(
  part: Part,
  placement: Placement,
  view: ViewName,
  furniture: Furniture,
): ProjectedRect {
  const { widthMm, depthMm } = furniture.input.dimensions;
  const common = { partId: part.id, role: part.role };

  switch (view) {
    case 'front':
      return {
        ...common,
        xMm: placement.xMm,
        yMm: placement.yMm,
        widthMm: placement.sizeXMm,
        heightMm: placement.sizeYMm,
        depthMm: placement.zMm,
      };

    case 'back':
      // Miroir : vu de derrière, la gauche du meuble est à droite du dessin. Ne pas
      // retourner ferait percer un trou du mauvais côté.
      return {
        ...common,
        xMm: widthMm - placement.xMm - placement.sizeXMm,
        yMm: placement.yMm,
        widthMm: placement.sizeXMm,
        heightMm: placement.sizeYMm,
        depthMm: depthMm - placement.zMm - placement.sizeZMm,
      };

    case 'top':
      return {
        ...common,
        xMm: placement.xMm,
        yMm: placement.zMm,
        widthMm: placement.sizeXMm,
        heightMm: placement.sizeZMm,
        // Vu de dessus, le plus haut est le plus proche.
        depthMm: -placement.yMm,
      };

    case 'bottom':
      return {
        ...common,
        xMm: widthMm - placement.xMm - placement.sizeXMm,
        yMm: placement.zMm,
        widthMm: placement.sizeXMm,
        heightMm: placement.sizeZMm,
        depthMm: placement.yMm,
      };

    case 'left':
      return {
        ...common,
        xMm: placement.zMm,
        yMm: placement.yMm,
        widthMm: placement.sizeZMm,
        heightMm: placement.sizeYMm,
        depthMm: placement.xMm,
      };

    case 'right':
      return {
        ...common,
        xMm: depthMm - placement.zMm - placement.sizeZMm,
        yMm: placement.yMm,
        widthMm: placement.sizeZMm,
        heightMm: placement.sizeYMm,
        depthMm: widthMm - placement.xMm - placement.sizeXMm,
      };
  }
}
