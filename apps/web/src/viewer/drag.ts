import { useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

/**
 * Faire glisser le long d'un axe, en millimètres.
 *
 * ## Le problème que ceci résout
 *
 * La souris se déplace en pixels d'écran ; le modèle se règle en millimètres. Entre les
 * deux il y a une caméra qui tourne : cent pixels vers la droite valent trente millimètres
 * de largeur vue de face, et **presque rien** vue de profil, où l'axe de la largeur pointe
 * vers l'observateur.
 *
 * Un facteur constant donnerait donc une poignée qui répond juste sous un angle et déraille
 * sous tous les autres — le genre de défaut qu'on attribue à sa souris.
 *
 * ## La conversion
 *
 * L'axe visé est projeté à l'écran au moment où l'on saisit : cela donne un vecteur en
 * pixels correspondant à **une unité de monde**. Le déplacement du pointeur y est ensuite
 * projeté, puis divisé par sa longueur. C'est exact quel que soit l'angle, et cela
 * s'effondre proprement quand l'axe pointe vers la caméra — la poignée devient sourde
 * plutôt que folle.
 */

/** Le monde est en mètres ; le modèle en millimètres. */
const MM_PER_UNIT = 1000;

/**
 * En deçà, l'axe est vu presque de bout : un pixel vaudrait des dizaines de millimètres.
 * La poignée cesse alors de répondre, ce qui est le comportement honnête — il faut tourner
 * le meuble.
 */
const MIN_PIXELS_PER_UNIT = 8;

export type Axis = 'x' | 'y' | 'z';

export interface AxisProjection {
  /** Le déplacement en pixels, converti en millimètres le long de l'axe. */
  toMm: (dxPx: number, dyPx: number) => number;
  /** Faux quand l'axe est trop proche de la direction du regard pour être tiré. */
  usable: boolean;
}

/**
 * Prépare la conversion pour un axe et un point donnés.
 *
 * À appeler **au moment de la saisie**, pas à chaque mouvement : la caméra ne bouge pas
 * pendant qu'on tire, et recalculer donnerait le même résultat pour plus cher.
 */
export function useAxisProjection(): (
  axis: Axis,
  originMm: readonly [number, number, number],
) => AxisProjection {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  return useCallback(
    (axis, originMm) => {
      const origin = new Vector3(
        originMm[0] / MM_PER_UNIT,
        originMm[1] / MM_PER_UNIT,
        originMm[2] / MM_PER_UNIT,
      );
      const tip = origin
        .clone()
        .add(
          new Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0),
        );

      const from = toScreen(origin, camera, size);
      const to = toScreen(tip, camera, size);

      const vector = { x: to.x - from.x, y: to.y - from.y };
      const length = Math.hypot(vector.x, vector.y);

      if (length < MIN_PIXELS_PER_UNIT) {
        return { usable: false, toMm: () => 0 };
      }

      return {
        usable: true,
        toMm: (dxPx, dyPx) =>
          ((dxPx * vector.x + dyPx * vector.y) / (length * length)) * MM_PER_UNIT,
      };
    },
    [camera, size],
  );
}

function toScreen(
  point: Vector3,
  camera: Parameters<typeof projectWith>[1],
  size: { width: number; height: number },
): { x: number; y: number } {
  return projectWith(point, camera, size);
}

function projectWith(
  point: Vector3,
  camera: { projectionMatrix: unknown } & Parameters<Vector3['project']>[0],
  size: { width: number; height: number },
): { x: number; y: number } {
  const ndc = point.clone().project(camera);

  // L'ordonnée d'écran descend, celle du repère normalisé monte.
  return {
    x: ((ndc.x + 1) / 2) * size.width,
    y: ((1 - ndc.y) / 2) * size.height,
  };
}
