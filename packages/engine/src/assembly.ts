import type { Furniture } from './build.js';
import type { PartRole } from './parts.js';

/**
 * Le guide de montage.
 *
 * **La séquence est portée par le modèle, pas déduite.** Chaque modèle prédéfini embarque
 * son ordre de montage, rédigé une fois ; le moteur n'y injecte que les cotes et les
 * identifiants de pièces.
 *
 * Ce n'est pas de la paresse : ordonnancer un montage devient réellement difficile dès
 * qu'il y a des tiroirs, et le MVP n'ayant que les modèles comme point d'entrée, une
 * séquence écrite couvre 100 % des cas. La déduction automatique deviendra nécessaire avec
 * l'éditeur manuel.
 *
 * @see docs/MANUFACTURING.md §4
 */

export interface AssemblyStepTemplate {
  /** Clé i18n de la consigne. Aucun texte ici : ce serait du français en dur. */
  key: string;
  /** Rôles concernés, dans l'ordre où l'étape les mentionne. */
  roles: readonly PartRole[];
  /**
   * La fixation : sa clé i18n, le rôle qu'elle fixe, et son nombre par pièce de ce rôle.
   *
   * Le rôle est nommé plutôt que sous-entendu. « Quatre vis par côté » ne veut pas dire
   * la même chose que « quatre vis par dessous », et les deux pièces sont dans la même
   * étape.
   */
  fastener?: { key: string; per: PartRole; count: number };
}

export interface AssemblyStep {
  index: number;
  total: number;
  key: string;
  /** Les pièces réelles, avec leurs identifiants — ceux que le plan porte. */
  parts: { id: string; role: PartRole; quantity: number }[];
  fastener?: { key: string; quantity: number };
}

/**
 * La séquence des modèles de la V1 : caisson, séparations, étagères, fond, tiroirs.
 *
 * Une étape dont aucune pièce n'existe est **retirée**, pas affichée vide : un meuble sans
 * tiroir ne doit pas lire « posez les tiroirs ».
 */
export const DEFAULT_ASSEMBLY: readonly AssemblyStepTemplate[] = [
  {
    key: 'carcass',
    roles: ['bottom', 'side'],
    fastener: { key: 'screw_4x50', per: 'side', count: 4 },
  },
  {
    key: 'top',
    roles: ['top', 'side'],
    fastener: { key: 'screw_4x50', per: 'side', count: 4 },
  },
  {
    key: 'dividers',
    roles: ['divider'],
    fastener: { key: 'dowel_8', per: 'divider', count: 8 },
  },
  {
    key: 'shelves',
    roles: ['shelf'],
    fastener: { key: 'shelf_support', per: 'shelf', count: 4 },
  },
  { key: 'back', roles: ['back'] },
  {
    key: 'drawers',
    roles: ['drawer_side', 'drawer_back_panel', 'drawer_front_panel', 'drawer_bottom'],
  },
  {
    key: 'drawer_faces',
    roles: ['drawer_face'],
    fastener: { key: 'drawer_slide_pair', per: 'drawer_face', count: 1 },
  },
  // Les portes en dernier : elles se règlent une fois tout le reste en place, et un
  // caisson qu'on manipule encore dérègle ce qu'on vient d'ajuster.
  { key: 'doors', roles: ['door'] },
];

export function assemblySteps(
  furniture: Furniture,
  templates: readonly AssemblyStepTemplate[] = DEFAULT_ASSEMBLY,
): AssemblyStep[] {
  const resolved = templates
    .map((template) => ({
      template,
      parts: furniture.parts
        .filter((part) => template.roles.includes(part.role))
        .map((part) => ({ id: part.id, role: part.role, quantity: part.quantity })),
    }))
    .filter((step) => step.parts.length > 0);

  return resolved.map((step, index) => {
    const fastener = step.template.fastener;
    const fastened = fastener
      ? step.parts.find((part) => part.role === fastener.per)
      : undefined;

    return {
      index: index + 1,
      total: resolved.length,
      key: step.template.key,
      parts: step.parts,
      ...(fastener && fastened
        ? {
            fastener: {
              key: fastener.key,
              quantity: fastener.count * fastened.quantity,
            },
          }
        : {}),
    };
  });
}
