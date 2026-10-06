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
  /**
   * Hauteur imposée de chaque espace entre étagères, du bas vers le haut.
   *
   * `n` étagères découpent le compartiment en `n + 1` espaces. Une entrée `null` — ou
   * absente — laisse l'espace souple : il se partage à parts égales ce que les espaces
   * imposés laissent, ce qui est le comportement d'origine.
   *
   * Un espace de 400 mm en bas pour les cartons à archives, le reste réparti au-dessus,
   * ne s'exprimait pas autrement : la division égale décidait pour le menuisier.
   *
   * **Un tableau trop long est toléré** : retirer une étagère ne doit pas rendre le modèle
   * invalide, et les entrées en trop sont simplement ignorées.
   *
   * @see docs/NEFTYA_ENGINE.md §7.3
   */
  shelfSpacesMm: z.array(positiveMillimetres.nullable()).max(16).default([]),
});

export type CompartmentInput = z.infer<typeof compartment>;

/**
 * L'emplacement où le meuble ira.
 *
 * **Facultatif, et il doit le rester.** Un meuble se conçoit sans savoir où il va ; exiger
 * une niche obligerait à en inventer une, et un chiffre inventé vaut moins que pas de
 * chiffre. Absent, aucun contrôle de pose n'est fait et rien n'est signalé.
 *
 * Chaque cote est indépendante : on connaît souvent la hauteur sous plafond sans avoir
 * mesuré la largeur disponible.
 *
 * @see docs/NEFTYA_ENGINE.md §7.5
 */
export const space = z.object({
  /** Entre les deux murs, pour une niche. */
  widthMm: positiveMillimetres.optional(),
  /** Du sol au plafond. C'est elle qui décide si le meuble peut être redressé sur place. */
  heightMm: positiveMillimetres.optional(),
  /** Du mur au premier obstacle. */
  depthMm: positiveMillimetres.optional(),
  /**
   * Hauteur de la plinthe au mur, s'il y en a une.
   *
   * Un caisson poussé contre un mur plinthé ne touche pas le mur : il porte sur la
   * plinthe et reste en avant d'autant. Personne n'y pense avant de pousser le meuble.
   */
  skirtingHeightMm: positiveMillimetres.optional(),
  /** Saillie de la plinthe par rapport au mur. C'est elle qui écarte le meuble. */
  skirtingDepthMm: positiveMillimetres.optional(),
});

export type SpaceInput = z.infer<typeof space>;

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
  /** Où le meuble ira, si on le sait. Voir `space`. */
  space: space.optional(),
});

export type FurnitureInput = z.input<typeof furnitureInput>;
export type ParsedFurnitureInput = z.infer<typeof furnitureInput>;
