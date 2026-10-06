import type { Furniture } from './build.js';
import type { PartRole } from './parts.js';
import { DOWEL, SCREW, hingesFor, slideFor } from './hardware.js';

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
  /**
   * Une fixation que seul le meuble peut nommer.
   *
   * Une coulisse porte sa longueur dans sa référence — on n'achète pas « une paire de
   * coulisses », on achète une paire de 400 — et une porte prend deux ou trois charnières
   * selon sa hauteur. Ces deux-là ne tiennent pas dans un gabarit écrit d'avance.
   */
  resolve?: (furniture: Furniture) => { key: string; quantity: number } | null;
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
    /*
     * Ni tourillon ni vis écrits d'avance : c'est le projet qui le dit.
     *
     * Le gabarit annonçait huit tourillons, quelle que soit la façon dont le meuble se
     * monte. Un meuble vissé aurait envoyé l'apprenti acheter des tourillons dont aucun
     * trou ne veut — et le guide d'assemblage, qui est tout ce qu'il a sous les yeux,
     * l'aurait confirmé.
     *
     * Le nombre vient de la même source que le perçage. Tenu à part, il en diverge, et
     * c'est au montage qu'on s'en aperçoit.
     */
    resolve: (furniture) => {
      const dividers = furniture.parts
        .filter((part) => part.role === 'divider')
        .reduce((total, part) => total + part.quantity, 0);

      if (dividers === 0) return null;

      const spec = furniture.parameters.joinery === 'screw' ? SCREW : DOWEL;

      // Deux abouts par séparateur : un dans le dessus, un dans le dessous.
      return { key: spec.key, quantity: dividers * spec.countPerJoint * 2 };
    },
  },
  {
    key: 'shelves',
    roles: ['shelf'],
    fastener: { key: 'shelf_support_5', per: 'shelf', count: 4 },
  },
  { key: 'back', roles: ['back'] },
  {
    key: 'drawers',
    roles: ['drawer_side', 'drawer_back_panel', 'drawer_front_panel', 'drawer_bottom'],
  },
  {
    key: 'drawer_faces',
    roles: ['drawer_face'],
    /*
     * La coulisse porte sa longueur, et c'est elle qu'on commande.
     *
     * L'étape annonçait `drawer_slide_pair`, la référence générique **retirée du catalogue
     * le 2 septembre** : la nomenclature disait `slide_ball_400` et l'étape disait autre
     * chose, pour la même chose. Un guide qui nomme deux fois le même article de deux
     * façons fait commander la mauvaise.
     */
    resolve: (furniture) => {
      const side = furniture.parts.find((part) => part.role === 'drawer_side');
      const depthMm = side?.instances[0]?.sizeZMm;
      const spec = depthMm === undefined ? null : slideFor(depthMm);
      if (!spec) return null;

      const faces = furniture.parts
        .filter((part) => part.role === 'drawer_face')
        .reduce((total, part) => total + part.quantity, 0);

      return { key: spec.key, quantity: faces };
    },
  },
  {
    // Les portes en dernier : elles se règlent une fois tout le reste en place, et un
    // caisson qu'on manipule encore dérègle ce qu'on vient d'ajuster.
    key: 'doors',
    roles: ['door'],
    /*
     * Les charnières manquaient à l'étape qui pose les portes.
     *
     * La nomenclature en comptait quatre et l'étape n'en parlait pas : l'apprenti vissait
     * ses portes sans savoir avec quoi. Leur nombre dépend de la hauteur du vantail, et il
     * est pris de la même fonction que le perçage — un compte tenu à part de la géométrie
     * finit par diverger d'elle.
     */
    resolve: (furniture) => {
      const quantity = furniture.parts
        .filter((part) => part.role === 'door')
        .reduce(
          (total, part) =>
            total + hingesFor(part.instances[0]?.sizeYMm ?? 0) * part.quantity,
          0,
        );

      return quantity > 0 ? { key: 'hinge_35_110', quantity } : null;
    },
  },
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

    /*
     * **Toutes les pièces du rôle, pas la première.**
     *
     * C'était un `find` : la visserie était comptée sur la première pièce trouvée, et les
     * autres ne comptaient pas. Ça tombait juste tant qu'un rôle n'avait qu'une pièce —
     * deux côtés identiques sont **une** pièce en quantité deux. Il suffit que deux
     * compartiments n'aient pas la même largeur pour que les étagères deviennent deux
     * pièces distinctes : l'apprenti recevait alors la moitié des taquets, et s'en
     * apercevait au montage.
     */
    const fastened = fastener
      ? step.parts
          .filter((part) => part.role === fastener.per)
          .reduce((total, part) => total + part.quantity, 0)
      : 0;

    // Ce que seul le meuble sait nommer passe avant le gabarit : une étape n'annonce
    // jamais deux fixations, et la plus précise est celle qui se commande.
    const named = step.template.resolve?.(furniture) ?? null;

    return {
      index: index + 1,
      total: resolved.length,
      key: step.template.key,
      parts: step.parts,
      ...(named
        ? { fastener: named }
        : fastener && fastened > 0
          ? { fastener: { key: fastener.key, quantity: fastener.count * fastened } }
          : {}),
    };
  });
}
