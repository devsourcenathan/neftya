import { furnitureInput, type ParsedFurnitureInput } from '@neftya/engine';
import type { LocalisedName } from '@neftya/contracts';

/**
 * Le catalogue livré avec Neftya.
 *
 * Il vit **dans le code**, pas en base : il est versionné avec le produit, identique dans
 * tous les environnements, et couvert par les tests. Le semer en base obligerait à une
 * migration de données à chaque modèle ajouté, et laisserait une base de production
 * diverger d'une base de développement sans que rien ne le signale.
 *
 * Les noms suivent le même contrat que ceux d'une organisation — un objet `{ fr, en }`,
 * résolu à la locale du jeton. Deux mécaniques de nommage pour la même liste finiraient par
 * diverger, et c'est l'organisation qui en paierait le prix : son modèle s'afficherait
 * autrement que ceux d'à côté.
 *
 * @see docs/I18N.md §6
 */

export interface CatalogueTemplate {
  /** Un slug, jamais traduit — il identifie le modèle dans les journaux et les URL. */
  readonly slug: string;
  readonly name: LocalisedName;
  readonly model: ParsedFurnitureInput;
}

export const CATALOGUE: readonly CatalogueTemplate[] = [
  {
    slug: 'bookcase',
    name: { fr: 'Bibliothèque', en: 'Bookcase' },
    model: furnitureInput.parse({
      dimensions: { widthMm: 1800, heightMm: 2000, depthMm: 300 },
      compartments: [
        { shelves: 4, drawers: 0 },
        { shelves: 4, drawers: 0 },
        { shelves: 4, drawers: 0 },
      ],
    }),
  },
  {
    slug: 'wardrobe',
    name: { fr: 'Dressing', en: 'Wardrobe' },
    model: furnitureInput.parse({
      dimensions: { widthMm: 2000, heightMm: 2400, depthMm: 600 },
      compartments: [
        // Une paire de vantaux par compartiment : un vantail de 1000 mm s'affaisserait.
        { shelves: 1, drawers: 0, doors: 2 },
        { shelves: 2, drawers: 3, doors: 2 },
      ],
    }),
  },
  {
    slug: 'tv-unit',
    name: { fr: 'Meuble TV', en: 'TV unit' },
    model: furnitureInput.parse({
      dimensions: { widthMm: 1600, heightMm: 500, depthMm: 400 },
      compartments: [
        { shelves: 0, drawers: 1 },
        { shelves: 1, drawers: 0 },
        { shelves: 0, drawers: 1 },
      ],
    }),
  },
  {
    slug: 'sideboard',
    name: { fr: 'Buffet', en: 'Sideboard' },
    model: furnitureInput.parse({
      dimensions: { widthMm: 1200, heightMm: 900, depthMm: 450 },
      compartments: [
        { shelves: 1, drawers: 1, doors: 1 },
        { shelves: 1, drawers: 1, doors: 1 },
      ],
    }),
  },
];
