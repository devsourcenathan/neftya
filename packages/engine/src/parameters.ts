import { z } from 'zod';
import { millimetres, positiveMillimetres } from './millimetres.js';

/**
 * Paramètres de projet.
 *
 * Tous ont un défaut, et tous sont modifiables. Les défauts visent une scie à panneaux
 * courante et du mélaminé 18 mm.
 *
 * @see docs/NEFTYA_ENGINE.md §4
 */

export const assemblyConvention = z.enum([
  /** Le dessus et le dessous font toute la largeur ; les côtés se logent entre eux. */
  'sides_between_top_bottom',
  /** Prévue au modèle, non exposée en V1. */
  'top_bottom_between_sides',
]);

export type AssemblyConvention = z.infer<typeof assemblyConvention>;

export const parameters = z.object({
  panelThicknessMm: positiveMillimetres.default(18),
  backThicknessMm: positiveMillimetres.default(8),
  /** Retrait du fond par rapport à l'arrière. */
  backSetbackMm: positiveMillimetres.default(18),
  /** Profondeur de la rainure recevant le fond. */
  grooveDepthMm: positiveMillimetres.default(4),
  /**
   * Trait de scie. N'intervient **que** dans l'optimisation des panneaux, jamais dans le
   * calcul des cotes : une pièce mesure ce qu'elle doit mesurer une fois coupée.
   */
  kerfMm: positiveMillimetres.default(3),
  /**
   * Jeu par côté pour une étagère dans son compartiment.
   *
   * Une étagère coupée à la largeur exacte de son ouverture **ne rentre pas** : il faut
   * l'engager entre deux panneaux déjà posés, et le bois n'est ni parfaitement droit ni
   * parfaitement d'équerre. Deux millimètres par côté, c'est ce que coupe un atelier.
   *
   * L'oubli de ce paramètre produisait un plan cohérent avec lui-même et infaisable.
   */
  shelfSideClearanceMm: positiveMillimetres.default(2),
  /** Jeu par côté pour les coulisses de tiroir. */
  drawerSideClearanceMm: positiveMillimetres.default(13),
  /** Jeu à l'arrière du caisson de tiroir. */
  drawerBackClearanceMm: positiveMillimetres.default(10),
  /** Jeu entre deux façades. */
  frontGapMm: positiveMillimetres.default(3),
  assemblyConvention: assemblyConvention.default('sides_between_top_bottom'),
  /**
   * Charge de référence pour la validation de flèche, en kilogrammes par étagère.
   * Passée en paramètre plutôt que codée : le moteur est déterministe et ne suppose rien.
   */
  shelfLoadKg: z.number().positive().default(20),
  /** Hauteur des pieds. Ne participe à aucune cote de découpe. */
  legHeightMm: millimetres.nonnegative().default(0),
});

export type Parameters = z.infer<typeof parameters>;

export const DEFAULT_PARAMETERS: Parameters = parameters.parse({});
