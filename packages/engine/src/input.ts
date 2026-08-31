import { z } from 'zod';
import { positiveMillimetres } from './millimetres.js';
import { materialKey } from './materials.js';
import { parameters, DEFAULT_PARAMETERS } from './parameters.js';

/**
 * L'entrée du moteur.
 *
 * Le **nombre** de compartiments, d'étagères et de tiroirs est décidé par l'utilisateur
 * et ne change jamais tout seul : élargir le meuble étire les éléments existants, il n'en
 * ajoute pas. C'est la propagation par étirement, et elle est ici, dans la forme même de
 * l'entrée.
 *
 * @see docs/NEFTYA_ENGINE.md §7.1
 */

export const compartment = z.object({
  /** Nombre d'étagères dans ce compartiment. */
  shelves: z.number().int().nonnegative().default(0),
  /** Nombre de tiroirs superposés dans ce compartiment. */
  drawers: z.number().int().nonnegative().default(0),
});

export type CompartmentInput = z.infer<typeof compartment>;

export const furnitureInput = z.object({
  dimensions: z.object({
    widthMm: positiveMillimetres,
    heightMm: positiveMillimetres,
    depthMm: positiveMillimetres,
  }),
  /** Un élément par compartiment. Au moins un. */
  compartments: z.array(compartment).min(1),
  material: materialKey.default('mdf'),
  parameters: parameters.default(() => DEFAULT_PARAMETERS),
  /** Un fond, sauf demande contraire. Un caisson sans fond se déforme. */
  hasBack: z.boolean().default(true),
});

export type FurnitureInput = z.input<typeof furnitureInput>;
export type ParsedFurnitureInput = z.infer<typeof furnitureInput>;
