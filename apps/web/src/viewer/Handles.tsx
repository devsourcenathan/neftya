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
const HANDLE_MM = 60;

/**
 * De combien chaque poignée sort de la face qu'elle règle.
 *
 * Posée à fleur, elle est à moitié dans le panneau : on croit viser le meuble et on tire
 * la cote, ou l'inverse.
 */
const OUTSET_MM = 40;

/**
 * L'avant du meuble, en millimètres.
 *
 * **Le z minimal, et non le maximal.** Les portes et les façades de tiroir sont posées à
 * `-18` mm ; le fond du caisson, lui, est au z le plus grand. Poser les poignées côté
 * profondeur les mettait donc derrière le meuble — sur le dos, là où on ne les cherche
 * pas et où le caisson les masque dès qu'on tourne autour.
 */
const FRONT_MM = 0;

/**
 * La hauteur de la poignée de profondeur, en part de la hauteur du meuble.
 *
 * **Pas au milieu.** Sur une bibliothèque à deux compartiments, le séparateur est au
 * centre : sa poignée et celle de la profondeur tombaient au même point, au millimètre
 * près. Deux poignées empilées se lisent comme une seule, et celle qu'on saisit n'est pas
 * celle qu'on croit.
 */
const DEPTH_HANDLE_HEIGHT = 0.18;

/** Le monde est en mètres ; le modèle en millimètres. */
const MM = 0.001;

/**
 * Bleu Artisan au repos, ambre à la saisie.
 *
 * Une poignée couleur bois disparaît dans le meuble : c'est ce qu'elles faisaient, et
 * c'est pourquoi on n'en comptait que deux. Une poignée est un élément d'interface posé
 * sur un objet ; elle doit se lire comme tel, et la palette du produit en tient déjà deux
 * qui ne ressemblent à aucune essence.
 */
const IDLE = '#031632';
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

export interface HandleSpec {
  /** `null` pour une cote du meuble ; le rang du séparateur sinon. */
  divider: number | null;
  axis: Axis;
  dimension?: 'widthMm' | 'heightMm' | 'depthMm';
  atMm: [number, number, number];
}

/**
 * Où se posent les poignées.
 *
 * **Extrait du composant pour être vérifiable.** Le premier jet posait la poignée de
 * profondeur au centre de la face avant — exactement où tombe le séparateur d'une
 * bibliothèque à deux compartiments. Deux poignées empilées se lisent comme une seule, et
 * celle qu'on saisit n'est pas celle qu'on croit. C'est de l'arithmétique, donc cela se
 * teste sans rien afficher.
 */
export function handleLayout(furniture: Furniture): HandleSpec[] {
  const { widthMm, heightMm, depthMm } = furniture.input.dimensions;

  return [
    // Une poignée par cote, en dehors de la face qu'elle repousse.
    {
      divider: null,
      axis: 'x',
      dimension: 'widthMm',
      atMm: [widthMm + OUTSET_MM, heightMm / 2, depthMm / 2],
    },
    {
      divider: null,
      axis: 'y',
      dimension: 'heightMm',
      atMm: [widthMm / 2, heightMm + OUTSET_MM, depthMm / 2],
    },
    {
      divider: null,
      axis: 'z',
      dimension: 'depthMm',
      atMm: [widthMm / 2, heightMm * DEPTH_HANDLE_HEIGHT, FRONT_MM - OUTSET_MM],
    },
    // Les séparateurs restent à mi-hauteur, là où on les cherche.
    ...dividerCentres(furniture).map((xMm, index): HandleSpec => ({
      divider: index,
      axis: 'x',
      atMm: [xMm, heightMm / 2, FRONT_MM - OUTSET_MM],
    })),
  ];
}

/** L'encombrement d'une poignée : deux ne doivent jamais se recouvrir. */
export const HANDLE_SIZE_MM = HANDLE_MM;

export function Handles({
  furniture,
  centre,
  onDimension,
  onDividerStart,
  onDividerMoved,
}: HandlesProps) {
  const { widthMm, heightMm, depthMm } = furniture.input.dimensions;
  const current = { widthMm, heightMm, depthMm };

  return (
    <group position={[-centre.x, -centre.y, -centre.z]}>
      {handleLayout(furniture).map((handle, index) => (
        <DragHandle
          key={`${handle.divider ?? handle.dimension}-${index}`}
          axis={handle.axis}
          atMm={handle.atMm}
          {...(handle.divider === null ? {} : { shape: 'bar' as const })}
          {...(handle.divider === null
            ? {}
            : { onStart: () => onDividerStart(handle.divider as number) })}
          onDrag={(deltaMm) =>
            handle.divider === null
              ? onDimension(
                  handle.dimension as 'widthMm',
                  current[handle.dimension as 'widthMm'] + deltaMm,
                )
              : onDividerMoved(handle.divider, deltaMm)
          }
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
    // Bouton gauche seulement.
    //
    // Un clic droit sur une poignée entamait un glissement et capturait le pointeur — ce
    // qui avale le `contextmenu` qui aurait suivi. La poignée mangeait donc le menu de la
    // pièce qu'elle recouvre, en silence.
    if (event.nativeEvent.button !== 0) return;

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
        opacity={dragging ? 1 : 0.85}
        depthTest={false}
      />
    </mesh>
  );
}
