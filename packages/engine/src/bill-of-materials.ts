import type { Furniture } from './build.js';
import type { DrillingResult } from './drilling.js';
import type { HardwareKey } from './hardware.js';
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

/**
 * Les vis et la colle se déduisent des assemblages ; tout le reste vient du **catalogue de
 * quincaillerie**, par sa clé de catalogue.
 *
 * `slide_ball_350` et non `drawer_slide_pair` : on n'achète pas « une coulisse », on achète
 * une coulisse de 350. Tant que la longueur restait implicite, le devis chiffrait un
 * article qui n'existe pas au tarif d'un fournisseur.
 */
export type AccessoryKey = 'screw_4x50' | 'glue' | HardwareKey;

export interface BillOfMaterials {
  panels: PanelLine[];
  /** Métrage de chant, en millimètres. L'affichage en mètres est une affaire de vue. */
  edgeBandingMm: number;
  accessories: AccessoryLine[];
}

/**
 * @param drilling Le perçage du meuble. La quincaillerie en est **déduite**, jamais
 * recomptée : un ratio tenu à part de la géométrie finit par diverger d'elle, et c'est
 * l'atelier qui découvre qu'il manque une charnière.
 */
export function billOfMaterials(
  furniture: Furniture,
  nesting: NestingResult,
  drilling: DrillingResult,
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
    accessories: accessories(furniture, drilling),
  };
}

/**
 * Les accessoires.
 *
 * **La quincaillerie vient du perçage.** Charnières, coulisses, tourillons et taquets sont
 * ceux que le plan perce, avec la référence de catalogue retenue — c'est la même liste,
 * lue deux fois.
 *
 * Restent les vis et la colle, qui ne se percent pas : leurs ratios sont ceux de la
 * menuiserie courante, et ils sont **ici**, visibles, plutôt qu'éparpillés dans une vue.
 */
function accessories(furniture: Furniture, drilling: DrillingResult): AccessoryLine[] {
  const sides = furniture.parts
    .filter((part) => part.role === 'side')
    .reduce((total, part) => total + part.quantity, 0);

  const lines: AccessoryLine[] = [
    // Quatre vis par côté et par extrémité : dessus et dessous.
    { key: 'screw_4x50', quantity: sides * 8 },
    ...drilling.hardware.map((line) => ({ key: line.key, quantity: line.quantity })),
    { key: 'glue', quantity: 1 },
  ];

  return lines.filter((line) => line.quantity > 0);
}
