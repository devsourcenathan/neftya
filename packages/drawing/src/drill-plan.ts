import type {
  DrilledPart,
  DrillingResult,
  Furniture,
  Hole,
  Part,
  Pocket,
} from '@neftya/engine';
import { ascii, rectangle, renderDxf, type DxfEntity } from './dxf.js';

/**
 * Le plan de perçage, en DXF.
 *
 * **Un bloc par face percée, chacun dans le repère de sa face.** C'est le choix qui porte
 * tout le fichier, et il mérite d'être dit :
 *
 * Le placement sur panneau vit dans le PDF, parce que c'est là qu'un opérateur le lit. Ici,
 * chaque pièce est dessinée seule, à plat, dans son propre repère — celui qu'on règle sur
 * une perceuse ou une commande numérique. Poser les perçages sur le plan de découpe
 * obligerait à savoir quelle face du panneau est en l'air, ce que le placement ne dit pas
 * et ne peut pas dire : un fraisage de charnière fait à l'envers traverse la porte.
 *
 * Une pièce percée des deux côtés donne donc **deux blocs**, chacun avec son contour et ses
 * cotes déjà comptées depuis le bon bord. Il n'y a rien à retourner de tête.
 *
 * @see docs/MANUFACTURING.md §7
 * @see docs/NEFTYA_ENGINE.md §12
 */

/** Les calques. Sans accent, comme tout ce qui part dans le fichier. */
export const LAYERS = {
  contour: 'CONTOUR',
  face: 'PERCAGE_FACE',
  back: 'PERCAGE_DOS',
  edge: 'PERCAGE_CHANT',
  /**
   * Les perçages **traversants**.
   *
   * Sur leur propre calque, et non mêlés aux borgnes : l'atelier ne monte pas la même
   * mèche, ne règle pas la même butée de profondeur, et un traversant fait sur un
   * réglage borgne ne tient rien. Un cercle ne dit pas s'il débouche.
   */
  through: 'PERCAGE_TRAVERSANT',
  /** Les empreintes à fraiser : une poche, pas un trou. */
  milling: 'FRAISAGE',
  label: 'REPERE',
} as const;

export interface DrillLabels {
  /** Le repère d'un bloc. Reçoit la face pour la nommer dans la langue du lecteur. */
  block: (partId: string, instanceIndex: number, face: 'front' | 'back') => string;
  /** Une ligne de légende par type de trou présent dans le bloc. */
  legend: (
    hole: Pick<Hole, 'purpose' | 'diameterMm' | 'depthMm' | 'through'>,
    count: number,
  ) => string;
  /** Une ligne par empreinte à fraiser. */
  pocket: (
    pocket: Pick<Pocket, 'purpose' | 'widthMm' | 'heightMm' | 'depthMm'>,
  ) => string;
}

export interface DrillPlanOptions {
  /** Écart entre deux blocs, et marge autour du texte. */
  gapMm?: number;
  /** Largeur au-delà de laquelle on passe à la ligne suivante. */
  rowWidthMm?: number;
  /** Hauteur du texte. Vingt millimètres restent lisibles une fois la planche réduite. */
  textHeightMm?: number;
}

const DEFAULTS = { gapMm: 120, rowWidthMm: 3000, textHeightMm: 20 };

/** La longueur du trait qui marque un perçage de chant. */
const EDGE_TICK_MM = 25;

export function drillPlanDxf(
  furniture: Furniture,
  drilling: DrillingResult,
  labels: DrillLabels,
  options: DrillPlanOptions = {},
): string {
  const gapMm = options.gapMm ?? DEFAULTS.gapMm;
  const rowWidthMm = options.rowWidthMm ?? DEFAULTS.rowWidthMm;
  const textHeightMm = options.textHeightMm ?? DEFAULTS.textHeightMm;

  const byId = new Map(furniture.parts.map((part) => [part.id, part]));
  const blocks = blocksOf(drilling, byId);

  const entities: DxfEntity[] = [];
  let cursorXMm = 0;
  let rowTopMm = 0;
  let rowHeightMm = 0;

  for (const block of blocks) {
    // La légende s'écrit sous le contour : il faut lui réserver sa place avant de savoir
    // où commence le bloc suivant.
    const legendHeightMm =
      (block.legend.length + block.pockets.length + 1) * textHeightMm * 1.6;
    const blockHeightMm = block.part.widthMm + legendHeightMm;

    if (cursorXMm > 0 && cursorXMm + block.part.lengthMm > rowWidthMm) {
      rowTopMm -= rowHeightMm + gapMm;
      cursorXMm = 0;
      rowHeightMm = 0;
    }

    const originXMm = cursorXMm;
    const originYMm = rowTopMm - blockHeightMm;

    entities.push(
      ...rectangle(
        LAYERS.contour,
        originXMm,
        originYMm + legendHeightMm,
        block.part.lengthMm,
        block.part.widthMm,
      ),
      ...holeEntities(block, originXMm, originYMm + legendHeightMm),
      ...pocketEntities(block, originXMm, originYMm + legendHeightMm),
      {
        kind: 'text',
        layer: LAYERS.label,
        xMm: originXMm,
        yMm: originYMm + legendHeightMm - textHeightMm * 1.6,
        heightMm: textHeightMm,
        value: labels.block(block.partId, block.instanceIndex, block.face),
      },
      ...block.legend.map((line, index) => ({
        kind: 'text' as const,
        layer: LAYERS.label,
        xMm: originXMm,
        yMm: originYMm + legendHeightMm - textHeightMm * 1.6 * (index + 2),
        heightMm: textHeightMm,
        value: labels.legend(line.hole, line.count),
      })),
      ...block.pockets.map((pocket, index) => ({
        kind: 'text' as const,
        layer: LAYERS.label,
        xMm: originXMm,
        yMm:
          originYMm +
          legendHeightMm -
          textHeightMm * 1.6 * (block.legend.length + index + 2),
        heightMm: textHeightMm,
        value: labels.pocket(pocket),
      })),
    );

    cursorXMm += block.part.lengthMm + gapMm;
    rowHeightMm = Math.max(rowHeightMm, blockHeightMm);
  }

  return renderDxf({
    layers: [
      { name: LAYERS.contour, colour: 7 },
      { name: LAYERS.face, colour: 1 },
      { name: LAYERS.back, colour: 5 },
      { name: LAYERS.edge, colour: 3 },
      { name: LAYERS.through, colour: 6 },
      { name: LAYERS.milling, colour: 2 },
      { name: LAYERS.label, colour: 7 },
    ],
    entities,
  });
}

interface Block {
  partId: string;
  instanceIndex: number;
  part: Part;
  /**
   * La face qu'on perce.
   *
   * Les perçages de chant sont rattachés au bloc de la face de référence : ils ne sont sur
   * aucune des deux faces, et en faire un troisième bloc dessinerait un contour de plus
   * pour quatre traits.
   */
  face: 'front' | 'back';
  holes: Hole[];
  pockets: Pocket[];
  legend: { hole: Hole; count: number }[];
}

function blocksOf(drilling: DrillingResult, byId: ReadonlyMap<string, Part>): Block[] {
  const blocks: Block[] = [];

  for (const drilled of drilling.parts) {
    const part = byId.get(drilled.partId);
    if (!part) continue;

    for (const face of ['front', 'back'] as const) {
      const holes = drilled.holes.filter(
        (hole) =>
          hole.side === face || (face === 'front' && hole.side.startsWith('edge_')),
      );
      const pockets = drilled.pockets.filter((pocket) => pocket.side === face);
      if (holes.length === 0 && pockets.length === 0) continue;

      blocks.push({
        partId: drilled.partId,
        instanceIndex: drilled.instanceIndex,
        part,
        face,
        holes,
        pockets,
        legend: legendOf(holes),
      });
    }
  }

  return blocks;
}

/** Un trou de chaque sorte, avec son compte. Cinquante lignes identiques n'apprennent rien. */
function legendOf(holes: readonly Hole[]): { hole: Hole; count: number }[] {
  const seen = new Map<string, { hole: Hole; count: number }>();

  for (const hole of holes) {
    const key = `${hole.purpose}|${hole.diameterMm}|${hole.depthMm}`;
    const entry = seen.get(key);

    if (entry) entry.count += 1;
    else seen.set(key, { hole, count: 1 });
  }

  return [...seen.values()];
}

function holeEntities(block: Block, originXMm: number, originYMm: number): DxfEntity[] {
  return block.holes.flatMap((hole) => {
    if (hole.side === 'front' || hole.side === 'back') {
      return [
        {
          kind: 'circle' as const,
          // Un traversant sur son propre calque : l'atelier ne monte pas la même mèche, et
          // un cercle ne dit pas s'il débouche.
          layer: hole.through
            ? LAYERS.through
            : hole.side === 'front'
              ? LAYERS.face
              : LAYERS.back,
          xMm: originXMm + hole.xMm,
          yMm: originYMm + hole.yMm,
          radiusMm: hole.diameterMm / 2,
        },
      ];
    }

    return [edgeTick(hole, block.part, originXMm, originYMm)];
  });
}

/**
 * Une empreinte fraisée : son contour, à la cote.
 *
 * Un rectangle et non un cercle, parce que c'est une poche : la représenter par un
 * perçage ferait fraiser un rond là où il faut un rectangle, et l'atelier s'en
 * apercevrait au premier panneau.
 */
function pocketEntities(
  block: Block,
  originXMm: number,
  originYMm: number,
): DxfEntity[] {
  return block.pockets.flatMap((pocket) =>
    rectangle(
      LAYERS.milling,
      originXMm + pocket.xMm - pocket.widthMm / 2,
      originYMm + pocket.yMm - pocket.heightMm / 2,
      pocket.widthMm,
      pocket.heightMm,
    ),
  );
}

/**
 * Un perçage de chant, marqué par un trait perpendiculaire au chant.
 *
 * Un cercle serait un mensonge : le trou n'est pas dans la face qu'on regarde, il entre par
 * la tranche. Le trait sort de la pièce, là où entre le foret.
 */
function edgeTick(
  hole: Hole,
  part: Part,
  originXMm: number,
  originYMm: number,
): DxfEntity {
  const line = (x1: number, y1: number, x2: number, y2: number): DxfEntity => ({
    kind: 'line',
    layer: LAYERS.edge,
    x1: originXMm + x1,
    y1: originYMm + y1,
    x2: originXMm + x2,
    y2: originYMm + y2,
  });

  switch (hole.side) {
    // Sur un chant `x`, la position court le long de la largeur de la pièce.
    case 'edge_x_min':
      return line(0, hole.xMm, -EDGE_TICK_MM, hole.xMm);
    case 'edge_x_max':
      return line(part.lengthMm, hole.xMm, part.lengthMm + EDGE_TICK_MM, hole.xMm);
    case 'edge_y_min':
      return line(hole.xMm, 0, hole.xMm, -EDGE_TICK_MM);
    default:
      return line(hole.xMm, part.widthMm, hole.xMm, part.widthMm + EDGE_TICK_MM);
  }
}

/** Les repères par défaut, en clair et sans accent. */
export const PLAIN_LABELS: DrillLabels = {
  block: (partId, instanceIndex, face) =>
    ascii(`${partId} #${instanceIndex + 1} - ${face === 'front' ? 'face' : 'dos'}`),
  legend: (hole, count) =>
    ascii(
      `${count}x ${hole.purpose} D${hole.diameterMm} ${
        hole.through ? 'traversant' : `p${hole.depthMm}`
      }`,
    ),
  pocket: (pocket) =>
    ascii(
      `fraisage ${pocket.purpose} ${pocket.widthMm}x${pocket.heightMm} p${pocket.depthMm}`,
    ),
};

export type { DrilledPart };
