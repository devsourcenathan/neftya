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
  | { type: 'grain'; respectGrain: boolean }
  | { type: 'compartments'; count: number }
  | { type: 'shelves'; index: number; count: number }
  | { type: 'drawers'; index: number; count: number }
  | { type: 'doors'; index: number; count: number }
  /** Insère une copie du compartiment juste après lui. */
  | { type: 'duplicateCompartment'; index: number }
  /** Retire **ce** compartiment, et non le dernier. */
  | { type: 'removeCompartment'; index: number }
  /** Donne à tous les compartiments le contenu de celui-ci. */
  | { type: 'applyToAll'; index: number }
  /** Fixe les largeurs intérieures. `undefined` rend un compartiment souple. */
  | { type: 'compartmentWidths'; widths: readonly (number | undefined)[] }
  /** Rend tous les compartiments souples : ils se repartagent la largeur également. */
  | { type: 'evenWidths' }
  /** Déplace un compartiment dans l'ordre du meuble. */
  | { type: 'moveCompartment'; from: number; to: number };

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
  /** En deçà, un compartiment ne reçoit plus rien : ni étagère, ni tiroir, ni porte. */
  compartmentWidthMm: { min: 60, max: 4000 },
} as const;

/**
 * Tirer un séparateur : ce que devient chaque largeur.
 *
 * **Deux compartiments changent, leur somme ne bouge pas.** L'un grandit de ce que l'autre
 * perd. C'est ce qui garde la largeur du meuble intacte — celle qu'on a mesurée contre un
 * mur — sans que le moteur ait à rattraper un écart après coup.
 *
 * Le déplacement est borné par le voisin : pousser au-delà ne rétrécit pas l'autre en deçà
 * du minimum, le séparateur s'arrête. Un arrêt franc se comprend ; un compartiment qui
 * disparaîtrait sous le pointeur, non.
 */
export function resizeAt(
  widths: readonly number[],
  index: number,
  deltaMm: number,
): number[] | null {
  const left = widths[index];
  const right = widths[index + 1];
  if (left === undefined || right === undefined) return null;

  const { min } = LIMITS.compartmentWidthMm;
  const bounded = Math.max(min - left, Math.min(right - min, Math.round(deltaMm)));
  if (bounded === 0) return null;

  const next = [...widths];
  next[index] = left + bounded;
  next[index + 1] = right - bounded;

  return next;
}

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

    case 'grain':
      return { ...model, respectGrain: action.respectGrain };

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

    /*
     * Un dressing, c'est souvent le même module trois fois. La copie se pose **juste
     * après** l'original plutôt qu'à la fin : c'est là qu'on la regarde, et c'est ce que
     * fait tout éditeur.
     */
    case 'duplicateCompartment': {
      const source = model.compartments[action.index];
      if (!source || model.compartments.length >= LIMITS.compartments.max) return model;

      const compartments = [...model.compartments];
      compartments.splice(action.index + 1, 0, { ...source });

      return { ...model, compartments };
    }

    /*
     * Supprimer **celui-là**.
     *
     * Réduire le nombre de compartiments tronque par la fin : cliquer « supprimer » sur le
     * premier effacerait le dernier, et le meuble changerait sous les yeux de quelqu'un
     * qui visait autre chose.
     *
     * Le dernier compartiment ne se supprime pas : un meuble sans compartiment n'est plus
     * un meuble, et le moteur le refuserait.
     */
    case 'removeCompartment': {
      if (model.compartments.length <= LIMITS.compartments.min) return model;
      if (!model.compartments[action.index]) return model;

      return {
        ...model,
        compartments: model.compartments.filter((_, index) => index !== action.index),
      };
    }

    /*
     * Le pendant de la duplication, pour un meuble régulier : le contenu se propage, le
     * **nombre** de compartiments ne bouge pas.
     */
    case 'applyToAll': {
      const source = model.compartments[action.index];
      if (!source) return model;

      return { ...model, compartments: model.compartments.map(() => ({ ...source })) };
    }

    /*
     * Tirer un séparateur écrit **deux** largeurs d'un coup — celle qui grandit et celle
     * qui rétrécit. Deux actions séparées feraient deux pas d'historique pour un geste, et
     * le premier `Ctrl+Z` laisserait le meuble dans un état que personne n'a vu.
     */
    case 'compartmentWidths':
      return {
        ...model,
        compartments: model.compartments.map((compartment, index) => {
          const widthMm = action.widths[index];

          if (widthMm === undefined) {
            const { widthMm: _dropped, ...rest } = compartment;
            return rest;
          }

          return { ...compartment, widthMm: Math.max(1, Math.round(widthMm)) };
        }),
      };

    /*
     * Le chemin du retour.
     *
     * Sans lui, une largeur posée une fois ne se retire plus qu'en annulant — et une
     * annulation ne se rattrape pas trois séances plus tard.
     */
    case 'evenWidths':
      return {
        ...model,
        compartments: model.compartments.map(({ widthMm: _dropped, ...rest }) => rest),
      };

    case 'moveCompartment': {
      const { from, to } = action;
      if (from === to) return model;
      if (!model.compartments[from] || !model.compartments[to]) return model;

      const compartments = [...model.compartments];
      const [moved] = compartments.splice(from, 1);
      compartments.splice(to, 0, moved as (typeof compartments)[number]);

      return { ...model, compartments };
    }
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
