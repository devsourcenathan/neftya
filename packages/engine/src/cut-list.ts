import type { Furniture } from './build.js';
import type { MaterialKey } from './materials.js';

/**
 * La liste de découpe : ce qu'on emporte à la scie.
 *
 * Elle ne calcule rien — elle présente. Les cotes viennent du moteur, et rien n'y est
 * saisi. C'est la même règle que pour la 3D et les plans : toutes les vues dérivent du
 * modèle, aucune n'est modifiable.
 *
 * @see docs/MANUFACTURING.md §1
 */

export interface CutListRow {
  id: string;
  role: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  material: MaterialKey;
  quantity: number;
  /** Métrage de chant pour cette ligne, quantité comprise. */
  edgeBandingMm: number;
}

export function cutList(furniture: Furniture): CutListRow[] {
  return furniture.parts.map((part) => ({
    id: part.id,
    role: part.role,
    lengthMm: part.lengthMm,
    widthMm: part.widthMm,
    thicknessMm: part.thicknessMm,
    material: part.material,
    quantity: part.quantity,
    edgeBandingMm:
      edgeBandingOf(part.lengthMm, part.widthMm, part.edges) * part.quantity,
  }));
}

/**
 * Les chants sont **listés, non déduits des cotes** : un chant de 0,4 à 1 mm se rattrape
 * au montage, et le déduire imposerait à chaque pièce de porter ses faces chantées pour
 * un gain non mesurable à la scie.
 *
 * @see docs/NEFTYA_ENGINE.md §7.4
 */
function edgeBandingOf(
  lengthMm: number,
  widthMm: number,
  edges: readonly string[],
): number {
  return edges.reduce(
    (total, edge) => total + (edge === 'front' || edge === 'back' ? lengthMm : widthMm),
    0,
  );
}

/** Métrage total de chant du meuble, en millimètres. */
export function totalEdgeBandingMm(furniture: Furniture): number {
  return cutList(furniture).reduce((total, row) => total + row.edgeBandingMm, 0);
}
