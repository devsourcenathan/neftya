import {
  furnitureInput,
  type MaterialKey,
  type ParsedFurnitureInput,
} from '@neftya/engine';

/**
 * Les modifications du modèle, en fonctions pures.
 *
 * Aucune ne touche à React, à une requête ou à une unité d'affichage : **elles prennent des
 * millimètres entiers et rendent des millimètres entiers**. C'est ce qui les rend testables
 * seules, et ce qui garantit qu'aucune conversion d'affichage ne peut se glisser dans le
 * modèle.
 *
 * @see docs/I18N.md §4
 */

export type DesignerAction =
  | { type: 'dimension'; axis: 'widthMm' | 'heightMm' | 'depthMm'; valueMm: number }
  | { type: 'material'; material: MaterialKey }
  | { type: 'back'; hasBack: boolean }
  | { type: 'compartments'; count: number }
  | { type: 'shelves'; index: number; count: number }
  | { type: 'drawers'; index: number; count: number }
  | { type: 'doors'; index: number; count: number };

/** Bornes de saisie. Le moteur en refuserait d'autres ; autant ne pas les proposer. */
export const LIMITS = {
  widthMm: { min: 200, max: 4000 },
  heightMm: { min: 200, max: 3000 },
  depthMm: { min: 100, max: 900 },
  compartments: { min: 1, max: 12 },
  shelves: { min: 0, max: 12 },
  drawers: { min: 0, max: 8 },
  // Au-delà de deux, ce n'est plus une porte mais une séparation.
  doors: { min: 0, max: 2 },
} as const;

export function reduce(
  model: ParsedFurnitureInput,
  action: DesignerAction,
): ParsedFurnitureInput {
  switch (action.type) {
    case 'dimension':
      return {
        ...model,
        dimensions: {
          ...model.dimensions,
          // Entier, toujours : un curseur peut rendre 1800.4 sur un écran à haute densité.
          [action.axis]: clamp(Math.round(action.valueMm), LIMITS[action.axis]),
        },
      };

    case 'material':
      return { ...model, material: action.material };

    case 'back':
      return { ...model, hasBack: action.hasBack };

    case 'compartments':
      return { ...model, compartments: resize(model.compartments, action.count) };

    case 'shelves':
      return {
        ...model,
        compartments: model.compartments.map((compartment, index) =>
          index === action.index
            ? { ...compartment, shelves: clamp(action.count, LIMITS.shelves) }
            : compartment,
        ),
      };

    case 'drawers':
      return {
        ...model,
        compartments: model.compartments.map((compartment, index) =>
          index === action.index
            ? { ...compartment, drawers: clamp(action.count, LIMITS.drawers) }
            : compartment,
        ),
      };

    case 'doors':
      return {
        ...model,
        compartments: model.compartments.map((compartment, index) =>
          index === action.index
            ? { ...compartment, doors: clamp(action.count, LIMITS.doors) }
            : compartment,
        ),
      };
  }
}

/**
 * Changer le nombre de compartiments conserve ceux qui restent.
 *
 * Passer de 4 à 3 puis revenir à 4 ne rend pas les étagères du quatrième — elles ont été
 * supprimées, et prétendre le contraire demanderait de garder un historique que personne
 * n'a demandé. Mais réduire ne doit pas réinitialiser les trois premiers.
 */
function resize(
  compartments: ParsedFurnitureInput['compartments'],
  count: number,
): ParsedFurnitureInput['compartments'] {
  const target = clamp(count, LIMITS.compartments);

  if (target <= compartments.length) return compartments.slice(0, target);

  return [
    ...compartments,
    ...Array.from({ length: target - compartments.length }, () => ({
      shelves: 0,
      drawers: 0,
      doors: 0,
    })),
  ];
}

function clamp(value: number, { min, max }: { min: number; max: number }): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Le meuble de départ.
 *
 * Passé par le schéma du moteur pour que les valeurs par défaut — paramètres d'assemblage,
 * jeux, épaisseurs — viennent de lui et d'un seul endroit.
 */
export function defaultModel(): ParsedFurnitureInput {
  return furnitureInput.parse({
    dimensions: { widthMm: 1800, heightMm: 2000, depthMm: 400 },
    compartments: [
      { shelves: 3, drawers: 0 },
      { shelves: 1, drawers: 2 },
      { shelves: 3, drawers: 0 },
    ],
    material: 'mdf',
    hasBack: true,
  });
}
