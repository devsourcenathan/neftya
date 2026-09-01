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
    | 'DRAWER_DOES_NOT_FIT'
    | 'DOOR_DOES_NOT_FIT'
    | 'DOOR_LEAF_TOO_WIDE';
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

    const face = faces[index] as { startMm: number; widthMm: number };
    const rows = facadeRows(compartment, height, p);

    const drawers = drawersOf({
      compartment,
      span,
      // Les caissons de tiroir n'occupent que la part intérieure située sous la porte.
      innerHeight: innerHeight - rows.doorHeightMm,
      innerDepth,
      parameters: p,
      faceWidthMm: face.widthMm,
      faceOffsetMm: face.startMm,
      faceHeights: rows.drawerHeights,
    });

    drafts.push(...drawers.drafts);
    warnings.push(...drawers.warnings);

    const doors = doorsOf({
      count: compartment.doors,
      face,
      yMm: rows.doorYMm,
      heightMm: rows.doorHeightMm,
      parameters: p,
    });

    drafts.push(...doors.drafts);
    warnings.push(...doors.warnings);
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
  /** Hauteur de chaque façade, du bas vers le haut. Calculée par `facadeRows`. */
  faceHeights: readonly number[];
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
  const faceHeights = options.faceHeights;

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
/**
 * Le partage vertical du plan de façade d'un compartiment.
 *
 * Tiroirs et portes vivent dans **le même plan** — celui qu'on voit de face — et se
 * partagent donc la hauteur. Chaque rangée reçoit une part égale, moins les jeux.
 *
 * **Convention V1 : les tiroirs en bas, la porte au-dessus.** C'est l'arrangement d'un
 * dressing à socle de tiroirs, le meuble que la V1 doit savoir faire. Un buffet range
 * souvent l'inverse ; rendre l'ordre configurable est un travail de V2, et l'inventer ici
 * demanderait de choisir à la place du menuisier.
 *
 * @see docs/NEFTYA_ENGINE.md §7.2
 */
function facadeRows(
  compartment: { drawers: number; doors: number },
  heightMm: number,
  p: Parameters,
): { drawerHeights: number[]; doorYMm: number; doorHeightMm: number } {
  const hasDoor = compartment.doors > 0;
  const rows = compartment.drawers + (hasDoor ? 1 : 0);

  if (rows === 0) return { drawerHeights: [], doorYMm: 0, doorHeightMm: 0 };

  const available = heightMm - (rows - 1) * p.frontGapMm;

  // Quand la hauteur ne suffit même pas aux jeux, il n'y a pas de façade à partager.
  //
  // `divideEvenly` distribuerait alors des hauteurs **négatives** et laisserait le reste à
  // la dernière rangée : la porte héritait d'une hauteur plausible tirée d'un partage
  // impossible. Les tiroirs étaient déjà refusés par leur propre contrôle ; la porte, non.
  if (available <= 0) {
    return {
      drawerHeights: Array.from({ length: compartment.drawers }, () => 0),
      doorYMm: 0,
      doorHeightMm: 0,
    };
  }

  const heights = divideEvenly(available, rows);
  const drawerHeights = heights.slice(0, compartment.drawers);

  // La porte occupe la dernière rangée, donc tout ce qui reste au-dessus des tiroirs.
  const doorYMm = drawerHeights.reduce(
    (total, height) => total + height + p.frontGapMm,
    0,
  );

  return {
    drawerHeights,
    doorYMm: hasDoor ? doorYMm : 0,
    doorHeightMm: hasDoor ? (heights[rows - 1] as number) : 0,
  };
}

/**
 * Les vantaux.
 *
 * Une porte est **en applique** : elle recouvre le devant du caisson, comme les façades de
 * tiroir, et pave la même surface. Encastrée à fleur, elle demanderait un jeu périmétrique
 * différent sur chaque bord et un caisson d'équerre au dixième — ce qui n'est pas ce
 * qu'on obtient d'un panneau scié.
 *
 * Deux vantaux se partagent la largeur du compartiment, moins le jeu qui les sépare.
 */
function doorsOf(options: {
  count: number;
  face: { startMm: number; widthMm: number };
  yMm: number;
  heightMm: number;
  parameters: Parameters;
}): { drafts: DraftPart[]; warnings: Warning[] } {
  const { count, face, parameters: p } = options;
  if (count === 0) return { drafts: [], warnings: [] };

  // **Deux vantaux égaux**, et le jeu central absorbe le millimètre impair.
  //
  // `divideEvenly` donnerait 498 et 499 : invisible sur une étagère, voyant entre deux
  // portes voisines qu'on regarde de face toute la journée. Un atelier aligne les vantaux
  // sur les bords du meuble et laisse le jeu rattraper la différence.
  const leafWidth =
    count === 2 ? Math.floor((face.widthMm - p.frontGapMm) / 2) : face.widthMm;
  const leafWidths = Array.from({ length: count }, () => leafWidth);
  const narrowest = leafWidth;

  // Un compartiment trop étroit ou une rangée trop basse ne produit **aucune** pièce :
  // une cote négative dans une liste de découpe est un plan faux.
  if (narrowest <= 0 || options.heightMm <= 0) {
    return {
      drafts: [],
      warnings: [
        {
          code: 'DOOR_DOES_NOT_FIT',
          details: {
            compartmentWidthMm: face.widthMm,
            leafWidthMm: narrowest,
            leafHeightMm: options.heightMm,
          },
        },
      ],
    };
  }

  const drafts: DraftPart[] = [];
  const warnings: Warning[] = [];

  // Chaque vantail est aligné sur son bord : le premier à gauche, le dernier à droite.
  // Ce qui reste au milieu est le jeu, légèrement plus large que nominal si la largeur
  // du compartiment est impaire.
  leafWidths.forEach((widthMm, index) => {
    const xMm = index === 0 ? face.startMm : face.startMm + face.widthMm - widthMm;

    drafts.push(
      panel(
        'door',
        widthMm,
        options.heightMm,
        p.panelThicknessMm,
        ['front', 'back', 'left', 'right'],
        {
          xMm,
          yMm: options.yMm,
          // En avant du caisson, comme une façade de tiroir.
          zMm: -p.panelThicknessMm,
          sizeXMm: widthMm,
          sizeYMm: options.heightMm,
          sizeZMm: p.panelThicknessMm,
        },
      ),
    );
  });

  if (narrowest > p.maxDoorLeafWidthMm) {
    warnings.push({
      code: 'DOOR_LEAF_TOO_WIDE',
      details: {
        leafWidthMm: narrowest,
        maximumMm: p.maxDoorLeafWidthMm,
      },
    });
  }

  return { drafts, warnings };
}

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
