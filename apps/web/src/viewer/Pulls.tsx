import { useRef, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Furniture, PlacedPull } from '@neftya/engine';
import { pulls } from '@neftya/engine';
import { useAxisProjection } from './drag.js';

/**
 * Les poignées de meuble, en 3D.
 *
 * ## Ce qu'elles ne sont pas
 *
 * Pas des `Part`. Une poignée ne se scie pas dans un panneau : elle s'achète. Elle
 * n'apparaît donc ni dans la liste de découpe ni dans le placement, et son rendu vit ici
 * plutôt que parmi les pièces.
 *
 * ## Le déplacement, sur deux axes à la fois
 *
 * Une poignée se déplace **sur sa façade**, donc en largeur et en hauteur ensemble. Les
 * deux axes sont projetés séparément à l'écran et le déplacement du pointeur est projeté
 * sur chacun : c'est ce qui fait qu'elle suit le doigt sous n'importe quel angle, là où un
 * facteur constant l'aurait rendue juste de face et folle de trois quarts.
 *
 * @see docs/NEFTYA_ENGINE.md §13
 */

/** Le monde est en mètres ; le modèle en millimètres. */
const MM = 0.001;

const METAL = '#6b7280';
const SELECTED = '#b45309';
/** Une empreinte est un creux : elle se lit sombre, pas brillante. */
const RECESS = '#3f3a33';

export interface PullsProps {
  furniture: Furniture;
  centre: { x: number; y: number; z: number };
  /** `compartment#rang` de la poignée sélectionnée. */
  selected: string | null;
  onSelect: (id: string | null) => void;
  /**
   * La poignée a été tirée jusqu'à cette position sur sa façade.
   *
   * En coordonnées de façade, jamais de meuble : une poignée suit sa porte, et une porte
   * qui change de largeur ne doit pas emporter sa poignée ailleurs.
   */
  onMove?: (
    pull: PlacedPull,
    rank: number,
    onFacadeMm: { xMm: number; yMm: number },
  ) => void;
  onContextMenu?: (target: {
    compartment: number;
    rank: number;
    xPx: number;
    yPx: number;
  }) => void;
}

/** L'identifiant d'affichage d'une poignée : son compartiment et son rang. */
export function pullId(compartment: number, rank: number): string {
  return `${compartment}#${rank}`;
}

/**
 * L'encombrement et la position du volume qui représente une poignée.
 *
 * **Extrait du composant pour être vérifiable.** Une poignée mal placée en profondeur
 * disparaît dans la façade ou flotte devant elle, et c'est exactement le genre d'erreur
 * qu'un canevas WebGL ne laisse pas lire dans un test. La dernière fois que j'ai laissé
 * une position de volume à l'oeil, deux poignées se superposaient au millimètre près.
 */
export function pullGeometry(pull: PlacedPull): {
  sizeMm: [number, number, number];
  atMm: [number, number, number];
} {
  const { spec, orientation, atMm } = pull;
  const along = orientation === 'horizontal';
  const depthMm = spec.shape === 'shell' ? spec.recessDepthMm : spec.projectionMm;

  return {
    sizeMm: [
      along ? spec.lengthMm : spec.widthMm,
      along ? spec.widthMm : spec.lengthMm,
      depthMm,
    ],
    atMm: [
      atMm.xMm,
      atMm.yMm,
      // L'avant du meuble est le z **minimal** : une barre saille vers les z négatifs, une
      // coquille se creuse vers les positifs.
      spec.shape === 'shell' ? atMm.zMm + depthMm / 2 : atMm.zMm - depthMm / 2,
    ],
  };
}

export function Pulls({
  furniture,
  centre,
  selected,
  onSelect,
  onMove,
  onContextMenu,
}: PullsProps) {
  const placed = pulls(furniture).pulls;

  /**
   * Le rang de chaque poignée **dans son compartiment**.
   *
   * `pulls()` rend une liste à plat ; le modèle, lui, les range par compartiment. C'est le
   * rang du modèle qu'une action doit porter, sinon supprimer la troisième poignée du
   * meuble en retirerait une autre.
   */
  const ranks = new Map<PlacedPull, number>();
  const seen = new Map<number, number>();
  for (const pull of placed) {
    const next = seen.get(pull.compartment) ?? 0;
    ranks.set(pull, next);
    seen.set(pull.compartment, next + 1);
  }

  return (
    <group position={[-centre.x, -centre.y, -centre.z]}>
      {placed.map((pull) => {
        const rank = ranks.get(pull) as number;
        const id = pullId(pull.compartment, rank);

        return (
          <PullMesh
            key={id}
            pull={pull}
            selected={selected === id}
            onSelect={() => onSelect(id)}
            {...(onMove
              ? { onMove: (at: { xMm: number; yMm: number }) => onMove(pull, rank, at) }
              : {})}
            {...(onContextMenu
              ? {
                  onContextMenu: (xPx: number, yPx: number) =>
                    onContextMenu({ compartment: pull.compartment, rank, xPx, yPx }),
                }
              : {})}
          />
        );
      })}
    </group>
  );
}

function PullMesh({
  pull,
  selected,
  onSelect,
  onMove,
  onContextMenu,
}: {
  pull: PlacedPull;
  selected: boolean;
  onSelect: () => void;
  onMove?: (onFacadeMm: { xMm: number; yMm: number }) => void;
  onContextMenu?: (xPx: number, yPx: number) => void;
}) {
  const project = useAxisProjection();
  const [dragging, setDragging] = useState(false);
  const start = useRef<{
    xPx: number;
    yPx: number;
    fromMm: { xMm: number; yMm: number };
    alongX: (dx: number, dy: number) => number;
    alongY: (dx: number, dy: number) => number;
  } | null>(null);

  const { spec, atMm } = pull;
  const geometry = pullGeometry(pull);
  const size = geometry.sizeMm.map((value) => value * MM) as [number, number, number];

  const begin = (event: ThreeEvent<PointerEvent>) => {
    if (!onMove || event.nativeEvent.button !== 0) return;

    const alongX = project('x', [atMm.xMm, atMm.yMm, atMm.zMm]);
    const alongY = project('y', [atMm.xMm, atMm.yMm, atMm.zMm]);
    if (!alongX.usable || !alongY.usable) return;

    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);

    start.current = {
      xPx: event.nativeEvent.clientX,
      yPx: event.nativeEvent.clientY,
      fromMm: pull.onFacadeMm,
      alongX: alongX.toMm,
      alongY: alongY.toMm,
    };
    setDragging(true);
    onSelect();
  };

  const move = (event: ThreeEvent<PointerEvent>) => {
    const from = start.current;
    if (!from || !onMove) return;

    event.stopPropagation();
    const dxPx = event.nativeEvent.clientX - from.xPx;
    const dyPx = event.nativeEvent.clientY - from.yPx;

    onMove({
      xMm: Math.round(from.fromMm.xMm + from.alongX(dxPx, dyPx)),
      yMm: Math.round(from.fromMm.yMm + from.alongY(dxPx, dyPx)),
    });
  };

  const end = (event: ThreeEvent<PointerEvent>) => {
    if (!start.current) return;

    (event.target as Element).releasePointerCapture?.(event.pointerId);
    start.current = null;
    setDragging(false);
    document.body.style.cursor = '';
  };

  return (
    <mesh
      position={geometry.atMm.map((value) => value * MM) as [number, number, number]}
      castShadow={spec.shape !== 'shell'}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onContextMenu={(event) => {
        if (!onContextMenu) return;
        event.stopPropagation();
        event.nativeEvent.preventDefault();
        onContextMenu(event.nativeEvent.clientX, event.nativeEvent.clientY);
      }}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = onMove ? 'grab' : 'pointer';
      }}
      onPointerOut={() => {
        if (!start.current) document.body.style.cursor = '';
      }}
    >
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={
          selected || dragging ? SELECTED : spec.shape === 'shell' ? RECESS : METAL
        }
        roughness={spec.shape === 'shell' ? 0.9 : 0.35}
        metalness={spec.shape === 'shell' ? 0 : 0.6}
      />
    </mesh>
  );
}
