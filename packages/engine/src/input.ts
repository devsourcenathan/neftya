import { z } from 'zod';
import { positiveMillimetres } from './millimetres.js';
import { pullPlacement } from './pulls.js';
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
  /**
   * Nombre de vantaux fermant ce compartiment : aucun, un, ou une paire.
   *
   * Au-delà de deux, ce n'est plus une porte mais une séparation : le meuble gagne un
   * compartiment, il ne gagne pas un troisième vantail.
   */
  doors: z.number().int().min(0).max(2).default(0),
  /**
   * Largeur intérieure imposée à ce compartiment.
   *
   * **Absente, le compartiment est souple** : il se partage à parts égales ce que les
   * compartiments imposés laissent. C'est le comportement d'origine, et il reste celui par
   * défaut — un meuble dont on n'a rien dit garde des compartiments réguliers.
   *
   * Un socle de tiroirs de 400 mm sous une penderie qui prend le reste ne s'exprimait pas
   * autrement : la division égale décidait pour le menuisier.
   *
   * @see docs/NEFTYA_ENGINE.md §7.3
   */
  widthMm: positiveMillimetres.optional(),
  /**
   * Les poignées posées sur les façades de ce compartiment.
   *
   * **Le premier élément du modèle qui ne se déduise de rien.** Deux meubles identiques
   * peuvent porter des poignées différentes, au même endroit ou non : aucune règle ne
   * permet de deviner laquelle, elle est donc saisie.
   *
   * Dans le compartiment plutôt que dans une liste globale : le dupliquer emporte ses
   * poignées, le supprimer les emporte aussi. Une liste séparée aurait demandé de
   * renuméroter des références à chaque fois, et une référence oubliée est une poignée sur
   * une façade qui n'existe plus.
   *
   * @see docs/NEFTYA_ENGINE.md §13
   */
  pulls: z.array(pullPlacement).max(8).default([]),
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
  /**
   * Respecter le sens du fil au placement.
   *
   * Sur un décor bois, le fil de deux pièces voisines doit courir dans le même sens : une
   * porte pivotée de 90° se voit à trois mètres, et aucune finition ne la rattrape. Le
   * placement perd alors le droit de pivoter les pièces visibles, et consomme davantage.
   *
   * **Faux par défaut**, parce que le moteur ne peut pas savoir si le panneau est un décor
   * bois ou un mélaminé uni : sur un uni, la contrainte ne coûterait que de la chute.
   *
   * @see docs/NEFTYA_ENGINE.md §8
   */
  respectGrain: z.boolean().default(false),
});

export type FurnitureInput = z.input<typeof furnitureInput>;
export type ParsedFurnitureInput = z.infer<typeof furnitureInput>;
