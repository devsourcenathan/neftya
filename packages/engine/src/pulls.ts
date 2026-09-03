import { z } from 'zod';
import type { Furniture } from './build.js';
import { facadesOf, hingeEdgeOf, type Facade } from './facades.js';
import { millimetres } from './millimetres.js';
import { barFor, pullFor, type PullSpec } from './hardware.js';

/**
 * Les poignées de meuble : ce qu'on saisit pour ouvrir.
 *
 * ## Ce qu'une poignée est, dans ce modèle
 *
 * **Une donnée du compartiment, pas une conséquence.** C'est le premier élément de Neftya
 * qui ne se déduise pas des paramètres : deux meubles identiques peuvent porter des
 * poignées différentes, au même endroit ou non, et aucune règle ne permet de deviner
 * laquelle. Elle est donc saisie, listée, déplaçable et supprimable — à l'inverse d'une
 * étagère, qui n'existe que parce qu'on a demandé trois étagères.
 *
 * Elle vit **dans son compartiment** plutôt que dans une liste globale : dupliquer un
 * compartiment emporte ses poignées, en supprimer un les emporte aussi. Une liste séparée
 * aurait demandé de renuméroter des références à chaque fois — et une référence oubliée
 * est une poignée sur une façade qui n'existe plus.
 *
 * ## La position
 *
 * En millimètres depuis le coin **inférieur gauche de la façade**, au centre de la
 * poignée. Absente, elle est calculée : centrée sur un tiroir, près du chant qui s'ouvre
 * sur un vantail. Une poignée du côté des charnières empêche la porte de s'ouvrir, et
 * c'est le genre d'erreur qu'un défaut ne doit pas produire.
 *
 * @see docs/NEFTYA_ENGINE.md §13
 */

export const pullPlacement = z.object({
  /** Sur quelle façade : un vantail ou une façade de tiroir. */
  target: z.enum(['door', 'drawer']),
  /** Vantaux de gauche à droite, tiroirs du bas vers le haut. */
  slot: z.number().int().nonnegative().default(0),
  /**
   * La clé du catalogue.
   *
   * Une chaîne libre, et non une énumération : un projet enregistré avec une référence
   * retirée du catalogue depuis doit **s'ouvrir quand même**. Le moteur signale alors la
   * poignée inconnue au lieu de refuser le meuble entier.
   */
  key: z.string().min(1).max(60),
  /** Depuis le coin inférieur gauche de la façade. Absente : calculée. */
  xMm: millimetres.optional(),
  yMm: millimetres.optional(),
});

export type PullPlacementInput = z.input<typeof pullPlacement>;
export type PullPlacement = z.infer<typeof pullPlacement>;

export interface PlacedPull {
  compartment: number;
  target: 'door' | 'drawer';
  slot: number;
  spec: PullSpec;
  /** Le centre de la poignée, dans le repère du meuble. */
  atMm: { xMm: number; yMm: number; zMm: number };
  /** Depuis le coin inférieur gauche de la façade — ce qu'on cote sur un plan. */
  onFacadeMm: { xMm: number; yMm: number };
  /**
   * Le sens de la poignée.
   *
   * Déduit, non saisi : une barre est verticale sur un vantail — c'est le geste de la main
   * qui ouvre — et horizontale sur un tiroir, qu'on tire à deux doigts.
   */
  orientation: 'horizontal' | 'vertical';
}

export interface PullWarning {
  code: 'PULL_UNKNOWN' | 'PULL_WITHOUT_FACADE' | 'PULL_OFF_FACADE';
  details: Record<string, number | string>;
}

export interface PullResult {
  pulls: PlacedPull[];
  warnings: PullWarning[];
}

/** Du chant qui s'ouvre au centre de la poignée, sur un vantail. */
const DOOR_EDGE_MARGIN_MM = 45;

/**
 * Matière à laisser entre la poignée et le chant de la façade.
 *
 * La contenance ne suffit pas : une barre dont le pied arrive à trois millimètres du bord
 * « tient » sur la façade et **fend le panneau** à la première vis. Douze millimètres,
 * c'est ce qu'un atelier laisse.
 */
const EDGE_MARGIN_MM = 12;

export function pulls(furniture: Furniture): PullResult {
  const facades = facadesOf(furniture);
  const placed: PlacedPull[] = [];
  const warnings: PullWarning[] = [];

  furniture.input.compartments.forEach((compartment, index) => {
    for (const request of compartment.pulls ?? []) {
      const spec = pullFor(request.key);

      if (!spec) {
        warnings.push({ code: 'PULL_UNKNOWN', details: { key: request.key } });
        continue;
      }

      const role = request.target === 'door' ? 'door' : 'drawer_face';
      const facade = facades.find(
        (candidate) =>
          candidate.compartment === index &&
          candidate.role === role &&
          candidate.slot === request.slot,
      );

      // Une poignée sur une façade retirée depuis : elle est signalée, jamais posée au
      // hasard sur la voisine.
      if (!facade) {
        warnings.push({
          code: 'PULL_WITHOUT_FACADE',
          details: { compartment: index, target: request.target, slot: request.slot },
        });
        continue;
      }

      const orientation = request.target === 'door' ? 'vertical' : 'horizontal';
      const onFacadeMm = position(furniture, facade, request);
      const fits = withinFacade(facade, spec, orientation, onFacadeMm);

      if (!fits) {
        warnings.push({
          code: 'PULL_OFF_FACADE',
          details: {
            compartment: index,
            xMm: onFacadeMm.xMm,
            yMm: onFacadeMm.yMm,
            facadeWidthMm: facade.placement.sizeXMm,
            facadeHeightMm: facade.placement.sizeYMm,
          },
        });
      }

      placed.push({
        compartment: index,
        target: request.target,
        slot: request.slot,
        spec,
        onFacadeMm,
        orientation,
        atMm: {
          xMm: facade.placement.xMm + onFacadeMm.xMm,
          yMm: facade.placement.yMm + onFacadeMm.yMm,
          // Devant la façade : la poignée est sur la face qu'on voit.
          zMm: facade.placement.zMm,
        },
      });
    }
  });

  return { pulls: placed, warnings };
}

/**
 * Où la poignée se pose sur sa façade.
 *
 * Ce qui est saisi l'emporte. À défaut : centrée sur un tiroir, et sur un vantail à
 * quarante-cinq millimètres du chant **qui s'ouvre** — jamais de celui des charnières, où
 * elle empêcherait la porte de s'ouvrir.
 */
function position(
  furniture: Furniture,
  facade: Facade,
  request: PullPlacement,
): { xMm: number; yMm: number } {
  const { sizeXMm: widthMm, sizeYMm: heightMm } = facade.placement;

  if (request.xMm !== undefined && request.yMm !== undefined) {
    return { xMm: request.xMm, yMm: request.yMm };
  }

  if (facade.role === 'drawer_face') {
    return {
      xMm: request.xMm ?? Math.round(widthMm / 2),
      yMm: request.yMm ?? Math.round(heightMm / 2),
    };
  }

  // Le chant qui s'ouvre est l'opposé du chant charnière. Sans montant d'aucun côté, la
  // poignée se centre : mieux vaut au milieu qu'à un bord tiré au hasard.
  const hinge = hingeEdgeOf(furniture, facade.placement);
  const margin = Math.min(DOOR_EDGE_MARGIN_MM, Math.round(widthMm / 2));

  const xMm =
    hinge === 'left'
      ? widthMm - margin
      : hinge === 'right'
        ? margin
        : Math.round(widthMm / 2);

  return {
    xMm: request.xMm ?? xMm,
    // À mi-hauteur : c'est là que la main se pose, sur une porte de n'importe quelle
    // hauteur. `orientation` ne change pas ce choix, il change l'encombrement.
    yMm: request.yMm ?? Math.round(heightMm / 2),
  };
}

/** La poignée tient-elle entièrement sur sa façade ? */
function withinFacade(
  facade: Facade,
  spec: PullSpec,
  orientation: 'horizontal' | 'vertical',
  atMm: { xMm: number; yMm: number },
): boolean {
  const alongMm = orientation === 'horizontal' ? spec.lengthMm : spec.widthMm;
  const acrossMm = orientation === 'horizontal' ? spec.widthMm : spec.lengthMm;

  return (
    atMm.xMm - alongMm / 2 >= EDGE_MARGIN_MM &&
    atMm.xMm + alongMm / 2 <= facade.placement.sizeXMm - EDGE_MARGIN_MM &&
    atMm.yMm - acrossMm / 2 >= EDGE_MARGIN_MM &&
    atMm.yMm + acrossMm / 2 <= facade.placement.sizeYMm - EDGE_MARGIN_MM
  );
}

/**
 * La poignée que Neftya propose par défaut pour une façade.
 *
 * La plus large barre qui y tienne, à défaut un bouton — qui tient partout. C'est ce que
 * l'interface pose quand on ajoute une poignée sans en choisir la forme.
 */
export function suggestedPull(facade: Facade): PullSpec {
  const alongMm =
    facade.role === 'door' ? facade.placement.sizeYMm : facade.placement.sizeXMm;

  return barFor(alongMm) ?? (pullFor('pull_knob') as PullSpec);
}
