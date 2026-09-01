import type { Furniture } from './build.js';
import type { MaterialKey } from './materials.js';
import { totalEdgeBandingMm } from './cut-list.js';
import type { NestingResult, PanelFormat } from './nesting.js';

/**
 * La liste des matériaux : ce qu'il faut acheter.
 *
 * Les panneaux sont **comptés d'après le placement**, pas estimés d'après une surface
 * divisée par une autre. Deux pièces qui ne tiennent pas côte à côte demandent deux
 * panneaux même si leur surface cumulée en remplirait un seul — et c'est le panneau qu'on
 * paie, pas la surface.
 *
 * @see docs/MANUFACTURING.md §3
 */

export interface PanelLine {
  material: MaterialKey;
  thicknessMm: number;
  format: PanelFormat;
  quantity: number;
}

export interface AccessoryLine {
  /** Clé stable, jamais traduite : l'interface en fait ce qu'elle veut. */
  key: AccessoryKey;
  quantity: number;
}

export type AccessoryKey =
  'screw_4x50' | 'dowel_8' | 'shelf_support' | 'drawer_slide_pair' | 'hinge' | 'glue';

export interface BillOfMaterials {
  panels: PanelLine[];
  /** Métrage de chant, en millimètres. L'affichage en mètres est une affaire de vue. */
  edgeBandingMm: number;
  accessories: AccessoryLine[];
}

export function billOfMaterials(
  furniture: Furniture,
  nesting: NestingResult,
): BillOfMaterials {
  const panels = new Map<string, PanelLine>();

  for (const panel of nesting.panels) {
    const key = `${panel.material}|${panel.thicknessMm}|${panel.format.lengthMm}x${panel.format.widthMm}`;
    const line = panels.get(key);

    if (line) line.quantity += 1;
    else {
      panels.set(key, {
        material: panel.material,
        thicknessMm: panel.thicknessMm,
        format: panel.format,
        quantity: 1,
      });
    }
  }

  return {
    panels: [...panels.values()],
    edgeBandingMm: totalEdgeBandingMm(furniture),
    accessories: accessories(furniture),
  };
}

/**
 * Les accessoires se déduisent des assemblages, pas d'un forfait.
 *
 * Les ratios sont ceux de la menuiserie courante, et ils sont **ici**, visibles, plutôt
 * qu'éparpillés dans une vue : le jour où un atelier travaille autrement, il n'y a qu'un
 * endroit à changer.
 */
/**
 * Le nombre de charnières d'un vantail dépend de sa **hauteur**, pas de son nombre.
 *
 * Deux charnières tiennent une porte basse ; une porte de dressing qui n'en aurait que
 * deux s'affaisse et finit par frotter sur le caisson. Les paliers sont ceux des
 * fabricants de quincaillerie.
 */
function hingesFor(leafHeightMm: number): number {
  if (leafHeightMm <= 900) return 2;
  if (leafHeightMm <= 1600) return 3;
  if (leafHeightMm <= 2000) return 4;
  return 5;
}

function hinges(furniture: Furniture): number {
  return furniture.parts
    .filter((part) => part.role === 'door')
    .reduce(
      // La hauteur d'un vantail est sa plus grande dimension : les cotes de découpe sont
      // normalisées, une porte de 2000 × 498 se lit dans cet ordre.
      (total, part) =>
        total + hingesFor(Math.max(part.lengthMm, part.widthMm)) * part.quantity,
      0,
    );
}

function accessories(furniture: Furniture): AccessoryLine[] {
  const count = (role: string) =>
    furniture.parts
      .filter((part) => part.role === role)
      .reduce((total, part) => total + part.quantity, 0);

  const sides = count('side');
  const dividers = count('divider');
  const shelves = count('shelf');
  const drawers = count('drawer_face');

  const lines: AccessoryLine[] = [
    // Quatre vis par côté et par extrémité : dessus et dessous.
    { key: 'screw_4x50', quantity: sides * 8 },
    // Huit tourillons par séparation, quatre par extrémité.
    { key: 'dowel_8', quantity: dividers * 8 },
    // Quatre taquets par étagère.
    { key: 'shelf_support', quantity: shelves * 4 },
    { key: 'drawer_slide_pair', quantity: drawers },
    { key: 'hinge', quantity: hinges(furniture) },
    { key: 'glue', quantity: 1 },
  ];

  return lines.filter((line) => line.quantity > 0);
}
