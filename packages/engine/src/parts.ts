import { z } from 'zod';
import type { MaterialKey } from './materials.js';

/**
 * Une pièce du meuble, et où elle se trouve.
 *
 * Une `Part` porte des cotes et une quantité : c'est ce que lit la liste de découpe. Ses
 * `instances` portent les positions : c'est ce que lit la 3D, où chaque instance est un
 * objet distinct portant le même identifiant. Deux côtés identiques sont donc **une**
 * pièce `P03` en quantité 2, à deux endroits — ce qu'un menuisier lit sur un plan.
 *
 * @see docs/NEFTYA_ENGINE.md §3
 */

export const partRole = z.enum([
  'top',
  'bottom',
  'side',
  'divider',
  'shelf',
  'back',
  'drawer_side',
  'drawer_front_panel',
  'drawer_back_panel',
  'drawer_bottom',
  'drawer_face',
  'door',
]);

export type PartRole = z.infer<typeof partRole>;

export const grain = z.enum(['length', 'width', 'none']);

export type Grain = z.infer<typeof grain>;

/** Faces recevant un chant. Seul l'avant est chanté par défaut. */
export const edge = z.enum(['front', 'back', 'left', 'right']);

export type Edge = z.infer<typeof edge>;

/**
 * Repère du meuble : origine au coin inférieur avant gauche.
 * `x` suit la largeur, `y` la hauteur, `z` la profondeur.
 */
export interface Placement {
  xMm: number;
  yMm: number;
  zMm: number;
  /** Encombrement dans le repère, une fois la pièce posée. */
  sizeXMm: number;
  sizeYMm: number;
  sizeZMm: number;
  /**
   * Le compartiment d'où cette instance vient, s'il y en a un.
   *
   * **Porté par l'instance, jamais par la pièce.** Deux compartiments de même largeur avec
   * une étagère chacun produisent la **même** `Part` en quantité 2 : la pièce appartient
   * alors à deux compartiments, l'instance à un seul.
   *
   * Absent sur l'enveloppe — dessus, dessous, côtés, fond — et sur les séparateurs, qui
   * sont entre deux compartiments et n'appartiennent à aucun.
   *
   * C'est ce qui permet à l'interface de remonter d'une pièce cliquée au paramètre qui l'a
   * produite. Le redevenir par géométrie marcherait, mais ce serait deviner là où le
   * moteur avait la réponse et l'a jetée.
   */
  compartment?: number;
}

export interface Part {
  /** `P01`, `P02`… stable, et repris par la 3D, les plans et la liste de découpe. */
  id: string;
  role: PartRole;
  /** Cotes de découpe : la plus grande dimension du panneau d'abord. */
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  material: MaterialKey;
  grain: Grain;
  edges: Edge[];
  quantity: number;
  instances: Placement[];
}

/** Les cotes qui font qu'une pièce est « la même » qu'une autre, donc groupable. */
export function partSignature(
  part: Pick<Part, 'role' | 'lengthMm' | 'widthMm' | 'thicknessMm' | 'material'>,
): string {
  return [part.role, part.lengthMm, part.widthMm, part.thicknessMm, part.material].join(
    '|',
  );
}
