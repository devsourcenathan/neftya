import { useRef, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { Furniture } from '@neftya/engine';
import { useAxisProjection, type Axis } from './drag.js';

/**
 * Les poignées : tirer une cote, tirer un séparateur.
 *
 * ## Ce qu'elles font, et ce qu'elles ne font pas
 *
 * Elles ne portent **aucune règle**. Une poignée de cote émet la même action que le
 * curseur du panneau ; une poignée de séparateur émet des largeurs de compartiment. Tout
 * ce qui décide — les bornes, le partage, les avertissements — reste dans le modèle et
 * dans le moteur. C'est ce qui permet de tirer et de saisir un nombre sans que les deux
 * chemins divergent.
 *
 * ## Pourquoi elles rendent une valeur absolue, et non un écart
 *
 * Un écart appliqué à chaque mouvement s'accumulerait sur l'état déjà modifié : la poignée
 * accélérerait toute seule, et le meuble partirait plus vite que le pointeur. La valeur de
 * départ est donc retenue à la saisie, et chaque mouvement rend « départ + déplacement ».
 */

/** Assez gros pour se saisir au doigt, assez petit pour ne pas masquer la pièce. */
const HANDLE_MM = 44;

/** Le monde est en mètres ; le modèle en millimètres. */
const MM = 0.001;

const IDLE = '#8a6d3b';
const ACTIVE = '#b45309';

export interface HandlesProps {
  furniture: Furniture;
  centre: { x: number; y: number; z: number };
  /** Une cote du meuble a été tirée. */
  onDimension: (axis: 'widthMm' | 'heightMm' | 'depthMm', valueMm: number) => void;
  /**
   * On vient de saisir un séparateur.
   *
   * Le déplacement est compté **depuis la saisie**, et les largeurs changent pendant qu'on
   * tire : sans ce repère, chaque mouvement s'appliquerait à un état déjà modifié et le
   * séparateur partirait plus vite que le pointeur.
   */
  onDividerStart: (index: number) => void;
  /** Un séparateur a été tiré, de tant de millimètres depuis la saisie. */
  onDividerMoved: (index: number, deltaMm: number) => void;
}

export function Handles({
  furniture,
  centre,
  onDimension,
  onDividerStart,
  onDividerMoved,
}: HandlesProps) {
  const { widthMm, heightMm, depthMm } = furniture.input.dimensions;

  return (
    <group position={[-centre.x, -centre.y, -centre.z]}>
      {/* Une poignée par cote, sur la face qu'elle repousse. */}
      <DragHandle
        axis="x"
        atMm={[widthMm, heightMm / 2, depthMm / 2]}
        onDrag={(deltaMm) => onDimension('widthMm', widthMm + deltaMm)}
      />
      <DragHandle
        axis="y"
        atMm={[widthMm / 2, heightMm, depthMm / 2]}
        onDrag={(deltaMm) => onDimension('heightMm', heightMm + deltaMm)}
      />
      <DragHandle
        axis="z"
        atMm={[widthMm / 2, heightMm / 2, depthMm]}
        onDrag={(deltaMm) => onDimension('depthMm', depthMm + deltaMm)}
      />

      {dividerCentres(furniture).map((xMm, index) => (
        <DragHandle
          key={index}
          axis="x"
          shape="bar"
          atMm={[xMm, heightMm / 2, depthMm]}
          onStart={() => onDividerStart(index)}
          onDrag={(deltaMm) => onDividerMoved(index, deltaMm)}
        />
      ))}
    </group>
  );
}

/**
 * Le centre de chaque séparateur, dans l'ordre.
 *
 * Lu sur les instances plutôt que recalculé : le moteur vient de les placer, et deux
 * calculs du même point finissent par ne plus donner le même.
 */
function dividerCentres(furniture: Furniture): number[] {
  return furniture.parts
    .filter((part) => part.role === 'divider')
    .flatMap((part) => part.instances)
    .map((placement) => placement.xMm + placement.sizeXMm / 2)
    .sort((a, b) => a - b);
}

function DragHandle({
  axis,
  atMm,
  onDrag,
  onStart,
  shape = 'knob',
}: {
  axis: Axis;
  atMm: readonly [number, number, number];
  /** Le déplacement **depuis la saisie**, en millimètres le long de l'axe. */
  onDrag: (deltaMm: number) => void;
  onStart?: () => void;
  shape?: 'knob' | 'bar';
}) {
  const project = useAxisProjection();
  const [dragging, setDragging] = useState(false);
  const start = useRef<{
    xPx: number;
    yPx: number;
    toMm: (x: number, y: number) => number;
  } | null>(null);

  const begin = (event: ThreeEvent<PointerEvent>) => {
    const projection = project(axis, atMm);
    // Vu de bout, l'axe ne se tire pas : un pixel y vaudrait des dizaines de millimètres.
    if (!projection.usable) return;

    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);

    start.current = {
      xPx: event.nativeEvent.clientX,
      yPx: event.nativeEvent.clientY,
      toMm: projection.toMm,
    };
    setDragging(true);
    onStart?.();
  };

  const move = (event: ThreeEvent<PointerEvent>) => {
    const from = start.current;
    if (!from) return;

    event.stopPropagation();
    onDrag(
      Math.round(
        from.toMm(
          event.nativeEvent.clientX - from.xPx,
          event.nativeEvent.clientY - from.yPx,
        ),
      ),
    );
  };

  const end = (event: ThreeEvent<PointerEvent>) => {
    if (!start.current) return;

    (event.target as Element).releasePointerCapture?.(event.pointerId);
    start.current = null;
    setDragging(false);
    document.body.style.cursor = '';
  };

  const size: [number, number, number] =
    shape === 'bar'
      ? [HANDLE_MM * MM, HANDLE_MM * 4 * MM, HANDLE_MM * 0.6 * MM]
      : [HANDLE_MM * MM, HANDLE_MM * MM, HANDLE_MM * MM];

  return (
    <mesh
      position={[atMm[0] * MM, atMm[1] * MM, atMm[2] * MM]}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = 'grab';
      }}
      onPointerOut={() => {
        if (!start.current) document.body.style.cursor = '';
      }}
    >
      <boxGeometry args={size} />
      {/* Devant le meuble quoi qu'il arrive : une poignée cachée derrière la pièce qu'elle
          règle ne se saisit pas. */}
      <meshBasicMaterial
        color={dragging ? ACTIVE : IDLE}
        transparent
        opacity={dragging ? 0.95 : 0.6}
        depthTest={false}
      />
    </mesh>
  );
}
