import { z } from 'zod';

/**
 * Les matériaux, et ce qu'il faut d'eux pour calculer une flèche.
 *
 * Les modules d'élasticité sont indicatifs et devront être affinés avec des valeurs
 * fournisseur. Ils sont ici pour que la validation technique existe, pas pour tenir lieu
 * de note de calcul.
 *
 * @see docs/NEFTYA_ENGINE.md §9
 */

export const materialKey = z.enum(['melamine', 'mdf', 'plywood', 'solid_wood']);

export type MaterialKey = z.infer<typeof materialKey>;

/** Module d'élasticité, en N/mm². */
export const YOUNG_MODULUS: Record<MaterialKey, number> = {
  melamine: 2500,
  mdf: 3000,
  plywood: 8000,
  solid_wood: 11000,
};

/**
 * Épaisseurs proposées par système d'unités.
 *
 * L'impérial n'est pas le métrique arrondi : 3/4" vaut 19,05 mm et non 18. Les deux
 * catalogues sont distincts, jamais dérivés l'un de l'autre — un côté de 3/4" traité
 * comme 18 mm décalerait chaque cote intérieure du caisson.
 *
 * @see docs/I18N.md §4
 */
export const PANEL_THICKNESSES_MM = {
  metric: [8, 10, 12, 16, 18, 19, 22, 25],
  // 1/4", 3/8", 1/2", 5/8", 3/4", 1"
  imperial: [6.35, 9.525, 12.7, 15.875, 19.05, 25.4],
} as const;

/**
 * Formats de panneaux, par système d'unités.
 *
 * Un panneau 4' × 8' mesure 2438,4 × 1219,2 mm, et non 2440 × 1220.
 */
export const PANEL_FORMATS_MM = {
  metric: [
    { lengthMm: 2440, widthMm: 1220 },
    { lengthMm: 2800, widthMm: 2070 },
    { lengthMm: 3050, widthMm: 1220 },
  ],
  imperial: [
    { lengthMm: 2438.4, widthMm: 1219.2 },
    { lengthMm: 3048, widthMm: 1524 },
  ],
} as const;
