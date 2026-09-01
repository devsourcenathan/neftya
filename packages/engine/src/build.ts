import { divideEvenly } from './millimetres.js';
import {
  furnitureInput,
  type FurnitureInput,
  type ParsedFurnitureInput,
} from './input.js';
import type { Parameters } from './parameters.js';
import type { Edge, Grain, Part, PartRole, Placement } from './parts.js';
import { shelfDeflection } from './deflection.js';

/**
 * Neftya Engine — construction d'un meuble à partir de ses paramètres.
 *
 * Pur : aucune entrée-sortie, aucune horloge, aucun aléatoire. Même entrée, même sortie,
 * toujours — c'est ce qui permet au même code de tourner dans le navigateur pour
 * l'interaction et sur le serveur pour ce qui fait foi.
 *
 * @see docs/NEFTYA_ENGINE.md §7 pour l'ordre de calcul
 */

export interface Warning {
  code:
    | 'SHELF_DEFLECTION'
    | 'NO_BACK_PANEL'
    | 'FRONT_GAP_OFF_DIVIDER'
    | 'COMPARTMENT_TOO_NARROW'
    | 'DRAWER_DOES_NOT_FIT';
  /** Identifiant de la pièce concernée, quand il y en a une. */
  partId?: string;
  details: Record<string, number | string>;
}

export interface Furniture {
  input: ParsedFurnitureInput;
  parameters: Parameters;
  parts: Part[];
  warnings: Warning[];
  /** Hauteur au sol, pieds compris. Affichée, jamais utilisée dans une cote. */
  totalHeightWithLegsMm: number;
}

/** Une pièce en cours de construction, avant attribution d'un identifiant. */
interface DraftPart {
  role: PartRole;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  grain: Grain;
  edges: Edge[];
  placement: Placement;
}

export function build(rawInput: FurnitureInput): Furniture {
  const input = furnitureInput.parse(rawInput);
  const { widthMm: width, heightMm: height, depthMm: depth } = input.dimensions;
  const p = input.parameters;
  const e = p.panelThicknessMm;

  const drafts: DraftPart[] = [];
  const warnings: Warning[] = [];

  // 2. Pièces d'enveloppe, par la convention d'assemblage : le dessus et le dessous font
  //    toute la largeur, les côtés se logent entre eux.
  const innerHeight = height - 2 * e;

  drafts.push(
    panel('top', width, depth, e, ['front'], {
      xMm: 0,
      yMm: height - e,
      zMm: 0,
      sizeXMm: width,
      sizeYMm: e,
      sizeZMm: depth,
    }),
    panel('bottom', width, depth, e, ['front'], {
      xMm: 0,
      yMm: 0,
      zMm: 0,
      sizeXMm: width,
      sizeYMm: e,
      sizeZMm: depth,
    }),
  );

  for (const xMm of [0, width - e]) {
    drafts.push(
      panel('side', innerHeight, depth, e, ['front'], {
        xMm,
        yMm: e,
        zMm: 0,
        sizeXMm: e,
        sizeYMm: innerHeight,
        sizeZMm: depth,
      }),
    );
  }

  // 3-5. Espace intérieur, séparateurs, puis largeur des compartiments. La division ne
  //      tombe pas toujours juste : le reste va au dernier compartiment (§7.3).
  const compartmentCount = input.compartments.length;
  const dividerCount = compartmentCount - 1;
  const innerWidth = width - 2 * e;
  const availableWidth = innerWidth - dividerCount * e;

  if (availableWidth < compartmentCount) {
    warnings.push({
      code: 'COMPARTMENT_TOO_NARROW',
      details: { availableWidth, compartmentCount },
    });
  }

  const compartmentWidths = divideEvenly(availableWidth, compartmentCount);

  // Profondeur utile : les étagères, séparateurs et tiroirs s'arrêtent devant le fond.
  const innerDepth = input.hasBack ? depth - p.backSetbackMm : depth;

  const compartmentSpans: { startMm: number; widthMm: number }[] = [];
  const dividerCentres: number[] = [];

  let cursor = e;
  for (let index = 0; index < compartmentCount; index += 1) {
    const compartmentWidth = compartmentWidths[index] as number;
    compartmentSpans.push({ startMm: cursor, widthMm: compartmentWidth });
    cursor += compartmentWidth;

    if (index < dividerCount) {
      drafts.push(
        panel('divider', innerHeight, innerDepth, e, ['front'], {
          xMm: cursor,
          yMm: e,
          zMm: 0,
          sizeXMm: e,
          sizeYMm: innerHeight,
          sizeZMm: innerDepth,
        }),
      );
      dividerCentres.push(cursor + e / 2);
      cursor += e;
    }
  }

  // 6. Contenu de chaque compartiment.
  const faces = faceLayout(dividerCentres, width, p);

  input.compartments.forEach((compartment, index) => {
    const span = compartmentSpans[index] as { startMm: number; widthMm: number };

    drafts.push(
      ...shelvesOf(
        compartment.shelves,
        span,
        innerHeight,
        innerDepth,
        e,
        p.shelfSideClearanceMm,
      ),
    );

    const drawers = drawersOf({
      compartment,
      span,
      innerHeight,
      innerDepth,
      parameters: p,
      faceWidthMm: (faces[index] as { widthMm: number }).widthMm,
      faceOffsetMm: (faces[index] as { startMm: number }).startMm,
      heightMm: height,
    });

    drafts.push(...drawers.drafts);
    warnings.push(...drawers.warnings);
  });

  // 7. Fond, logé dans une rainure.
  if (input.hasBack) {
    const backLength = innerWidth + 2 * p.grooveDepthMm;
    const backWidth = innerHeight + 2 * p.grooveDepthMm;

    drafts.push(
      panel('back', backLength, backWidth, p.backThicknessMm, [], {
        xMm: e - p.grooveDepthMm,
        yMm: e - p.grooveDepthMm,
        zMm: depth - p.backSetbackMm,
        sizeXMm: backLength,
        sizeYMm: backWidth,
        sizeZMm: p.backThicknessMm,
      }),
    );
  } else {
    warnings.push({ code: 'NO_BACK_PANEL', details: {} });
  }

  const parts = groupIntoParts(drafts, input.material);

  warnings.push(
    ...deflectionWarnings(parts, input.material, p),
    ...frontGapWarnings(faces, dividerCentres, p, parts),
  );

  return {
    input,
    parameters: p,
    parts,
    warnings,
    totalHeightWithLegsMm: height + p.legHeightMm,
  };
}

/**
 * Les étagères se répartissent la hauteur intérieure : `n` étagères découpent le
 * compartiment en `n + 1` espaces, et le reste de division va au dernier.
 */
function shelvesOf(
  count: number,
  span: { startMm: number; widthMm: number },
  innerHeight: number,
  innerDepth: number,
  thickness: number,
  clearanceMm: number,
): DraftPart[] {
  if (count === 0) return [];

  const spaces = divideEvenly(innerHeight - count * thickness, count + 1);
  const widthMm = span.widthMm - clearanceMm * 2;
  const drafts: DraftPart[] = [];

  let y = thickness;
  for (let index = 0; index < count; index += 1) {
    y += spaces[index] as number;
    drafts.push(
      // L'étagère est plus étroite que son ouverture, et centrée dedans : coupée à la cote
      // exacte, elle ne s'engagerait pas entre deux panneaux déjà posés.
      panel('shelf', widthMm, innerDepth, thickness, ['front'], {
        xMm: span.startMm + clearanceMm,
        yMm: y,
        zMm: 0,
        sizeXMm: widthMm,
        sizeYMm: thickness,
        sizeZMm: innerDepth,
      }),
    );
    y += thickness;
  }

  return drafts;
}

/**
 * Un tiroir est un petit caisson — deux côtés, un devant, un dos, un fond — sur lequel se
 * visse une **façade rapportée**. La façade étant indépendante, elle se règle après
 * montage : c'est ce qui rattrape un caisson légèrement hors d'équerre.
 *
 * @see docs/NEFTYA_ENGINE.md §5.1
 */
function drawersOf(options: {
  compartment: { drawers: number };
  span: { startMm: number; widthMm: number };
  innerHeight: number;
  innerDepth: number;
  parameters: Parameters;
  faceWidthMm: number;
  faceOffsetMm: number;
  heightMm: number;
}): { drafts: DraftPart[]; warnings: Warning[] } {
  const { compartment, span, innerHeight, innerDepth, parameters: p } = options;
  const count = compartment.drawers;
  if (count === 0) return { drafts: [], warnings: [] };

  const e = p.panelThicknessMm;
  const boxOuterWidth = span.widthMm - 2 * p.drawerSideClearanceMm;
  const boxDepth = innerDepth - p.drawerBackClearanceMm;
  const boxHeights = divideEvenly(innerHeight, count);
  const panelWidthMm = boxOuterWidth - 2 * e;

  // Un compartiment peut être trop étroit, trop peu profond ou trop bas pour recevoir le
  // tiroir demandé. Le moteur ne produit alors aucune pièce — une cote négative serait un
  // plan de découpe faux — et le signale pour que l'interface l'explique.
  const minimumBoxHeight = 2 * e;
  if (
    panelWidthMm <= 0 ||
    boxDepth <= 0 ||
    (boxHeights[0] as number) < minimumBoxHeight
  ) {
    return {
      drafts: [],
      warnings: [
        {
          code: 'DRAWER_DOES_NOT_FIT',
          details: {
            compartmentWidthMm: span.widthMm,
            usableWidthMm: panelWidthMm,
            usableDepthMm: boxDepth,
            drawerHeightMm: boxHeights[0] as number,
          },
        },
      ],
    };
  }
  const faceHeights = divideEvenly(
    options.heightMm - (count - 1) * p.frontGapMm,
    count,
  );

  const drafts: DraftPart[] = [];
  let y = e;
  let faceY = 0;

  for (let index = 0; index < count; index += 1) {
    const boxHeight = boxHeights[index] as number;
    const faceHeight = faceHeights[index] as number;

    // Deux côtés, sur toute la profondeur du tiroir.
    for (const xMm of [
      span.startMm + p.drawerSideClearanceMm,
      span.startMm + p.drawerSideClearanceMm + boxOuterWidth - e,
    ]) {
      drafts.push(
        panel('drawer_side', boxDepth, boxHeight, e, [], {
          xMm,
          yMm: y,
          zMm: 0,
          sizeXMm: e,
          sizeYMm: boxHeight,
          sizeZMm: boxDepth,
        }),
      );
    }

    // Devant et dos, entre les côtés.
    const panelWidth = panelWidthMm;
    for (const [role, zMm] of [
      ['drawer_front_panel', 0],
      ['drawer_back_panel', boxDepth - e],
    ] as const) {
      drafts.push(
        panel(role, panelWidth, boxHeight, e, [], {
          xMm: span.startMm + p.drawerSideClearanceMm + e,
          yMm: y,
          zMm,
          sizeXMm: panelWidth,
          sizeYMm: boxHeight,
          sizeZMm: e,
        }),
      );
    }

    drafts.push(
      panel('drawer_bottom', panelWidth, boxDepth, p.backThicknessMm, [], {
        xMm: span.startMm + p.drawerSideClearanceMm + e,
        yMm: y,
        zMm: 0,
        sizeXMm: panelWidth,
        sizeYMm: p.backThicknessMm,
        sizeZMm: boxDepth,
      }),
    );

    // La façade pave la face avant du meuble : elle est plus large que son compartiment,
    // couvrant aussi la moitié des séparateurs voisins.
    drafts.push(
      panel(
        'drawer_face',
        options.faceWidthMm,
        faceHeight,
        e,
        ['front', 'back', 'left', 'right'],
        {
          xMm: options.faceOffsetMm,
          yMm: faceY,
          zMm: -e,
          sizeXMm: options.faceWidthMm,
          sizeYMm: faceHeight,
          sizeZMm: e,
        },
      ),
    );

    y += boxHeight;
    faceY += faceHeight + p.frontGapMm;
  }

  return { drafts, warnings: [] };
}

/**
 * Où poser les façades sur la face avant du meuble.
 *
 * Le jeu entre deux façades est **centré sur le séparateur** plutôt que placé par une
 * division uniforme de la largeur. La division uniforme donne des façades égales, ce qui
 * est plus joli, mais elle ignore la position réelle des séparateurs : sur des panneaux
 * fins ou des compartiments inégaux, un jeu finit à côté de son séparateur et l'on voit à
 * l'intérieur du meuble. Centrer le jeu rend la faute impossible par construction plutôt
 * que détectable après coup.
 *
 * Conséquence assumée : les façades d'extrémité sont plus larges que les intérieures,
 * puisqu'elles couvrent aussi le côté du caisson. C'est ce que fait un recouvrement total
 * sur un vrai meuble.
 *
 * @see docs/NEFTYA_ENGINE.md §5.1
 */
function faceLayout(
  dividerCentres: readonly number[],
  widthMm: number,
  p: Parameters,
): { startMm: number; widthMm: number }[] {
  const halfGapBefore = Math.floor(p.frontGapMm / 2);

  // Position de départ de chaque jeu, centré sur son séparateur.
  const gapStarts = dividerCentres.map((centre) => Math.round(centre) - halfGapBefore);

  const layout: { startMm: number; widthMm: number }[] = [];
  let start = 0;

  for (const gapStart of gapStarts) {
    layout.push({ startMm: start, widthMm: gapStart - start });
    start = gapStart + p.frontGapMm;
  }
  layout.push({ startMm: start, widthMm: widthMm - start });

  return layout;
}

/** La plus grande dimension d'abord : c'est ainsi qu'on lit une cote de découpe. */
function panel(
  role: PartRole,
  a: number,
  b: number,
  thicknessMm: number,
  edges: Edge[],
  placement: Placement,
): DraftPart {
  return {
    role,
    lengthMm: Math.max(a, b),
    widthMm: Math.min(a, b),
    thicknessMm,
    // Modélisé dès maintenant pour qu'activer la contrainte en V2 n'impose aucune
    // migration ; l'optimiseur V1 ne s'en sert pas encore.
    grain: 'length',
    edges,
    placement,
  };
}

/**
 * Regroupe les pièces identiques : deux côtés aux mêmes cotes sont **une** pièce en
 * quantité 2, à deux endroits. C'est ce qu'un menuisier lit sur un plan, et ce que la
 * liste de découpe additionne.
 */
function groupIntoParts(drafts: DraftPart[], material: Part['material']): Part[] {
  const groups = new Map<string, Part>();

  for (const draft of drafts) {
    const key = [
      draft.role,
      draft.lengthMm,
      draft.widthMm,
      draft.thicknessMm,
      draft.edges.join(','),
    ].join('|');

    const existing = groups.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.instances.push(draft.placement);
      continue;
    }

    groups.set(key, {
      id: '',
      role: draft.role,
      lengthMm: draft.lengthMm,
      widthMm: draft.widthMm,
      thicknessMm: draft.thicknessMm,
      material,
      grain: draft.grain,
      edges: draft.edges,
      quantity: 1,
      instances: [draft.placement],
    });
  }

  return [...groups.values()].map((part, index) => ({
    ...part,
    id: `P${String(index + 1).padStart(2, '0')}`,
  }));
}

function deflectionWarnings(
  parts: Part[],
  material: Part['material'],
  p: Parameters,
): Warning[] {
  return parts
    .filter((part) => part.role === 'shelf')
    .map((part) => ({
      part,
      result: shelfDeflection({
        spanMm: part.lengthMm,
        depthMm: part.widthMm,
        thicknessMm: part.thicknessMm,
        material,
        loadKg: p.shelfLoadKg,
      }),
    }))
    .filter(({ result }) => result.excessive)
    .map(({ part, result }) => ({
      code: 'SHELF_DEFLECTION' as const,
      partId: part.id,
      details: {
        spanMm: part.lengthMm,
        deflectionMm: Math.round(result.deflectionMm * 100) / 100,
        limitMm: Math.round(result.limitMm * 100) / 100,
        loadKg: p.shelfLoadKg,
      },
    }));
}

/**
 * Chaque jeu entre façades doit tomber sur un séparateur, sinon on voit à l'intérieur du
 * meuble. La contrainte n'est pas évidente : une façade est plus large que son
 * compartiment, et c'est précisément ce qui la fait fonctionner.
 */
function frontGapWarnings(
  faces: readonly { startMm: number; widthMm: number }[],
  dividerCentres: readonly number[],
  p: Parameters,
  parts: Part[],
): Warning[] {
  if (!parts.some((part) => part.role === 'drawer_face')) return [];

  const warnings: Warning[] = [];
  const e = p.panelThicknessMm;

  // Le jeu étant centré sur le séparateur, ce contrôle ne devrait jamais se déclencher.
  // Il reste pour le seul cas où il le peut : un jeu plus large que le séparateur.
  for (let index = 0; index < faces.length - 1; index += 1) {
    const face = faces[index] as { startMm: number; widthMm: number };
    const gapStart = face.startMm + face.widthMm;
    const gapEnd = gapStart + p.frontGapMm;
    const centre = dividerCentres[index] as number;

    if (gapStart < centre - e / 2 || gapEnd > centre + e / 2) {
      warnings.push({
        code: 'FRONT_GAP_OFF_DIVIDER',
        details: {
          gapStart,
          gapEnd,
          dividerStart: centre - e / 2,
          dividerEnd: centre + e / 2,
        },
      });
    }
  }

  return warnings;
}
