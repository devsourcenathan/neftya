import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds } from '@react-three/drei';
import { useTranslation } from 'react-i18next';
import { hingeEdgeOf } from '@neftya/engine';
import type {
  AssemblyStep,
  DrilledPart,
  Furniture,
  Hole,
  Pocket,
} from '@neftya/engine';
import { accessoryLabel } from './accessory-label.js';
import { Button } from '../ui/index.js';

/**
 * Le guide de montage, une étape à la fois, avec ce qu'on pose.
 *
 * ## Pourquoi un dessin
 *
 * « Assemblez le dessous et les côtés, côtés à l'intérieur, alignés sur les bords »
 * suppose qu'on sache déjà à quoi ça ressemble. C'est vrai pour un menuisier et faux pour
 * un apprenti, et c'est lui qui monte. Un code de pièce et une phrase ne disent pas de quel
 * côté va la rainure.
 *
 * ## Ce que le dessin montre, et dans quel ordre
 *
 * Les pièces de l'étape **en pleine couleur**, celles des étapes précédentes **en
 * transparence**, celles des étapes suivantes **absentes**. Un meuble entier à chaque
 * étape ne dirait pas ce qu'il faut poser ; une pièce seule ne dirait pas où elle va.
 *
 * ## Une seule toile, pas une par étape
 *
 * Un navigateur ne tient qu'une poignée de contextes WebGL — huit vignettes en ouvriraient
 * huit, et la neuvième ferait tomber les premières. Une toile et un pas à pas, c'est aussi
 * la façon dont on monte un meuble : une étape, les mains dedans, puis la suivante.
 */

/** Le monde est en mètres ; le modèle en millimètres. */
const MM = 0.001;

/**
 * À quelle étape chaque pièce est posée.
 *
 * À la **première** étape qui la nomme : un côté est mentionné au caisson puis au dessus,
 * et il se pose au caisson. Le prendre à la dernière le ferait apparaître deux étapes trop
 * tard, et l'apprenti chercherait sur quoi visser le dessus.
 */
export function placedAtStep(
  steps: readonly AssemblyStep[],
): ReadonlyMap<string, number> {
  const at = new Map<string, number>();

  steps.forEach((step, index) => {
    for (const part of step.parts) if (!at.has(part.id)) at.set(part.id, index);
  });

  return at;
}

/**
 * Comment une pièce se montre à une étape donnée.
 *
 * `absent` tant qu'elle n'est pas posée — un meuble entier à chaque étape ne dirait pas ce
 * qu'il y a à faire. `posée` quand c'est son tour. `déjà là` ensuite, en transparence :
 * sans elle, une étagère flotte dans le vide.
 */
export function partStateAt(
  placedAt: ReadonlyMap<string, number>,
  partId: string,
  current: number,
): 'absent' | 'posee' | 'deja' {
  const at = placedAt.get(partId);
  if (at === undefined || at > current) return 'absent';
  return at === current ? 'posee' : 'deja';
}

const WOOD = '#b08968';
const ACTIVE = '#b45309';

/**
 * Ce qu'il faut savoir pour **poser** une pièce, et que le moteur savait déjà.
 *
 * Le sens d'ouverture, les coordonnées de chaque trou sur chaque face, le fil, les chants à
 * plaquer : tout cela est calculé depuis le premier jour. Le dossier n'en montrait que des
 * comptes — « 4 × embase de charnière » — pendant que les quatre positions dormaient dans
 * l'export DXF, qui ne sert qu'à une machine à commande numérique.
 *
 * Une instance, pas une pièce : les deux vantaux d'une paire sont la **même** pièce en
 * quantité deux, et ils ne se percent pas pareil. L'un ouvre à gauche, l'autre à droite.
 */
export interface FittingEntry {
  partId: string;
  role: string;
  /** Rang de l'exemplaire, quand la pièce en a plusieurs. `null` s'il est seul. */
  copy: number | null;
  grain: string;
  edges: readonly string[];
  /** `left` : charnières à gauche, donc la porte s'ouvre vers la droite. */
  hinge: 'left' | 'right' | null;
  holes: { side: string; items: readonly Hole[] }[];
  pockets: readonly Pocket[];
}

export function fittingSheet(
  furniture: Furniture,
  drilled: readonly DrilledPart[],
  step: AssemblyStep,
): FittingEntry[] {
  const wanted = new Set(step.parts.map((part) => part.id));
  const entries: FittingEntry[] = [];

  for (const part of furniture.parts) {
    if (!wanted.has(part.id)) continue;

    part.instances.forEach((placement, index) => {
      const drilling = drilled.find(
        (candidate) =>
          candidate.partId === part.id && candidate.instanceIndex === index,
      );

      /*
       * Les trous groupés par face.
       *
       * On ne perce pas une pièce en la retournant à chaque trou : l'atelier la pose sur
       * une face, fait tout ce qui s'y trouve, puis la retourne. Une liste à plat
       * obligerait à trier de tête.
       */
      const bySide = new Map<string, Hole[]>();
      for (const hole of drilling?.holes ?? []) {
        bySide.set(hole.side, [...(bySide.get(hole.side) ?? []), hole]);
      }

      entries.push({
        partId: part.id,
        role: part.role,
        copy: part.instances.length > 1 ? index + 1 : null,
        grain: part.grain,
        edges: part.edges,
        hinge: part.role === 'door' ? hingeEdgeOf(furniture, placement) : null,
        holes: [...bySide.entries()].map(([side, items]) => ({ side, items })),
        pockets: drilling?.pockets ?? [],
      });
    });
  }

  return entries;
}

export function AssemblyGuide({
  furniture,
  steps,
  drilled,
}: {
  furniture: Furniture;
  steps: readonly AssemblyStep[];
  /** Les perçages par instance — c'est là que vivent les coordonnées. */
  drilled: readonly DrilledPart[];
}) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(0);

  const placedAt = useMemo(() => placedAtStep(steps), [steps]);

  const centre = {
    x: (furniture.input.dimensions.widthMm * MM) / 2,
    y: (furniture.input.dimensions.heightMm * MM) / 2,
    z: (furniture.input.dimensions.depthMm * MM) / 2,
  };

  const step = steps[current];
  if (!step) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="h-80 overflow-hidden rounded-md border border-hairline bg-surface-low">
        <Canvas
          shadows={false}
          camera={{ fov: 40, position: [2.4, 1.9, -3] }}
          /* Le cadrage se refait à chaque étape : une pièce posée loin du centre sortirait
             du champ si la vue restait figée sur le premier caisson. */
          key={`${furniture.parts.length}-${current}`}
        >
          <ambientLight intensity={0.65} />
          <directionalLight position={[3.5, 5, 3]} intensity={1.2} />
          <directionalLight position={[-4, 2, -3]} intensity={0.35} />

          <Bounds fit clip observe margin={1.3}>
            <group position={[-centre.x, -centre.y, -centre.z]}>
              {furniture.parts.flatMap((part) =>
                part.instances.map((placement, index) => {
                  const state = partStateAt(placedAt, part.id, current);
                  // Les étapes suivantes n'existent pas encore : les montrer dirait que
                  // tout est déjà là.
                  if (state === 'absent') return null;

                  const active = state === 'posee';

                  return (
                    <mesh
                      key={`${part.id}-${index}`}
                      position={[
                        (placement.xMm + placement.sizeXMm / 2) * MM,
                        (placement.yMm + placement.sizeYMm / 2) * MM,
                        (placement.zMm + placement.sizeZMm / 2) * MM,
                      ]}
                    >
                      <boxGeometry
                        args={[
                          placement.sizeXMm * MM,
                          placement.sizeYMm * MM,
                          placement.sizeZMm * MM,
                        ]}
                      />
                      <meshStandardMaterial
                        color={active ? ACTIVE : WOOD}
                        transparent={!active}
                        /* Assez présentes pour situer, assez effacées pour qu'on voie ce
                           qu'on pose : sans elles, une étagère flotte dans le vide. */
                        opacity={active ? 1 : 0.22}
                        roughness={0.8}
                      />
                    </mesh>
                  );
                }),
              )}
            </group>
          </Bounds>
        </Canvas>
      </div>

      <div className="flex flex-col gap-3">
        <p className="label-caps text-ink-variant">
          {t('manufacturing.step', { index: step.index, total: step.total })}
        </p>

        <p className="text-body-lg text-ink">{t(`assembly.${step.key}`)}</p>

        <ul className="flex flex-col gap-3 text-sm">
          {fittingSheet(furniture, drilled, step).map((entry) => (
            <li
              key={`${entry.partId}-${entry.copy ?? 0}`}
              className="border-l-2 border-hairline pl-3"
            >
              <p className="text-ink">
                <span className="font-mono text-xs text-outline">{entry.partId}</span>{' '}
                {t(`part.roles.${entry.role}`)}
                {entry.copy !== null && (
                  <span className="text-ink-variant">
                    {' '}
                    · {t('manufacturing.copy', { index: entry.copy })}
                  </span>
                )}
              </p>

              {/* Le sens d'ouverture : su depuis toujours, affiché pour la première fois.
                  C'est lui qui décide de quel côté se percent les boîtiers. */}
              {entry.hinge && (
                <p className="text-ink">
                  {t(
                    entry.hinge === 'left'
                      ? 'manufacturing.opensRight'
                      : 'manufacturing.opensLeft',
                  )}
                </p>
              )}

              <p className="text-ink-variant">
                {t('manufacturing.grainOf', {
                  grain: t(`part.grains.${entry.grain}`),
                })}
                {' · '}
                {entry.edges.length > 0
                  ? t('manufacturing.edgesOf', {
                      edges: entry.edges
                        .map((edge) => t(`part.edgeNames.${edge}`))
                        .join(', '),
                    })
                  : t('manufacturing.noEdgesToBand')}
              </p>

              {entry.holes.length === 0 && entry.pockets.length === 0 ? (
                <p className="text-ink-variant">{t('manufacturing.noHoles')}</p>
              ) : (
                entry.holes.map((face) => (
                  <div key={face.side} className="mt-1">
                    <p className="label-caps text-ink-variant">
                      {t(`part.sides.${face.side}`)}
                    </p>
                    <ul className="font-mono text-xs text-ink-variant">
                      {face.items.map((hole, index) => (
                        <li key={index}>
                          {t('manufacturing.holeLine', {
                            diameter: hole.diameterMm,
                            depth: hole.depthMm,
                            x: hole.xMm,
                            y: hole.yMm,
                          })}
                          {hole.through && ` · ${t('manufacturing.holeThrough')}`}
                          {' · '}
                          {/* Les barres et les coulisses portent leur cote dans leur
                              clé — `pull_bar_128`, `slide_ball_400` — et une entrée de
                              traduction par longueur dirait six fois la même chose. */}
                          {accessoryLabel(t, hole.hardware)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}

              {entry.pockets.map((pocket, index) => (
                <p key={index} className="font-mono text-xs text-ink-variant">
                  {t('manufacturing.pocketLine', {
                    width: pocket.widthMm,
                    height: pocket.heightMm,
                    depth: pocket.depthMm,
                    x: pocket.xMm,
                    y: pocket.yMm,
                  })}
                </p>
              ))}
            </li>
          ))}
        </ul>

        {step.fastener && (
          <p className="text-sm text-ink">
            {t(`accessory.${step.fastener.key}`)} × {step.fastener.quantity}
          </p>
        )}

        <div className="mt-auto flex items-center gap-3">
          <Button
            tone="ghost"
            disabled={current === 0}
            onClick={() => setCurrent((index) => Math.max(0, index - 1))}
          >
            {t('manufacturing.previousStep')}
          </Button>
          <Button
            disabled={current === steps.length - 1}
            onClick={() => setCurrent((index) => Math.min(steps.length - 1, index + 1))}
          >
            {t('manufacturing.nextStep')}
          </Button>
        </div>
      </div>
    </div>
  );
}
