import type { Furniture } from './build.js';
import type { MaterialKey } from './materials.js';
import { PANEL_FORMATS_MM } from './materials.js';

/**
 * Le placement des pièces sur les panneaux.
 *
 * C'est un problème de *bin packing* 2D, NP-difficile. Neftya ne cherche pas l'optimum
 * mais une bonne solution rapide **sous des contraintes réelles** :
 *
 *  - **coupes guillotine**, traversantes de bord à bord — les seules qu'une scie à panneaux
 *    sait faire. Un placement libre serait plus dense et infaisable à l'atelier ;
 *  - **trait de scie réservé à chaque coupe**. Il n'entre jamais dans les cotes des pièces :
 *    une pièce mesure ce qu'elle doit mesurer une fois coupée ;
 *  - **rotation autorisée en V1**, le sens du fil étant modélisé mais non contraignant.
 *
 * L'algorithme est un placement par bandes (*first-fit decreasing height*) : les bandes
 * horizontales sont exactement les premières coupes traversantes, et les coupes verticales
 * à l'intérieur d'une bande sont traversantes de la bande. Le résultat est donc guillotine
 * par construction, pas par vérification.
 *
 * @see docs/MANUFACTURING.md §2
 * @see docs/NEFTYA_ENGINE.md §6
 */

export interface PanelFormat {
  lengthMm: number;
  widthMm: number;
}

/** Une pièce posée sur un panneau. `xMm`/`yMm` : coin inférieur gauche. */
export interface Placement2D {
  partId: string;
  xMm: number;
  yMm: number;
  /** Encombrement une fois posée : déjà pivoté le cas échéant. */
  sizeXMm: number;
  sizeYMm: number;
  rotated: boolean;
}

export interface NestedPanel {
  material: MaterialKey;
  thicknessMm: number;
  /** Le panneau **acheté**, cotes nominales. C'est lui qu'on paie. */
  format: PanelFormat;
  /** Ce qui reste après délignage, et où les pièces sont réellement posées. */
  usableFormat: PanelFormat;
  /** Retiré sur chaque rive avant de scier. */
  trimMm: number;
  placements: Placement2D[];
  /** Somme des surfaces des pièces posées. */
  usedAreaMm2: number;
  /** Surface du panneau acheté. */
  areaMm2: number;
  /**
   * Part du panneau **acheté** occupée par des pièces, de 0 à 1.
   *
   * Rapportée au panneau nominal et non à la surface délignée : la perte du délignage est
   * une perte réelle, et la masquer ferait paraître le plan meilleur qu'il n'est.
   */
  utilisation: number;
}

export interface NestingResult {
  panels: NestedPanel[];
  kerfMm: number;
  /**
   * Pièces qu'aucun panneau ne peut recevoir, même vide.
   *
   * Elles sont **rendues, pas ignorées** : un plan de découpe amputé d'une pièce est un
   * plan faux, et le silence en ferait un plan faux qui a l'air complet.
   */
  unplaced: string[];
}

export interface NestingOptions {
  /** Formats disponibles. Le premier qui peut recevoir la plus grande pièce est retenu. */
  formats?: readonly PanelFormat[];
  kerfMm?: number;
  /**
   * Délignage : ce qu'on retire sur chaque rive avant de scier.
   *
   * Un panneau livré arrive avec des rives abîmées et rarement d'équerre. Placer les pièces
   * jusqu'au bord nominal donne un plan qui ne tient que sur le papier — et c'est la
   * dernière coupe qui manque.
   */
  trimMm?: number;
}

interface Item {
  partId: string;
  longMm: number;
  shortMm: number;
  material: MaterialKey;
  thicknessMm: number;
}

interface Shelf {
  yMm: number;
  heightMm: number;
  cursorXMm: number;
}

/** Dix millimètres par rive : la pratique courante d'un atelier. */
export const DEFAULT_TRIM_MM = 10;

export function nest(
  furniture: Furniture,
  options: NestingOptions = {},
): NestingResult {
  const kerfMm = options.kerfMm ?? furniture.parameters.kerfMm;
  const formats = options.formats ?? PANEL_FORMATS_MM.metric;
  const trimMm = options.trimMm ?? DEFAULT_TRIM_MM;

  // Une pièce par instance : la liste de découpe groupe, la scie ne groupe pas.
  const items: Item[] = furniture.parts.flatMap((part) =>
    Array.from({ length: part.quantity }, () => ({
      partId: part.id,
      longMm: Math.max(part.lengthMm, part.widthMm),
      shortMm: Math.min(part.lengthMm, part.widthMm),
      material: part.material,
      thicknessMm: part.thicknessMm,
    })),
  );

  const panels: NestedPanel[] = [];
  const unplaced: string[] = [];

  // Un panneau ne mélange ni les matériaux ni les épaisseurs : on ne scie pas du 8 mm et
  // du 18 mm dans la même planche.
  for (const group of groupBy(items)) {
    const format = chooseFormat(group, formats, trimMm);

    if (!format) {
      unplaced.push(...group.map((item) => item.partId));
      continue;
    }

    // Une pièce trop grande pour le plus grand format ne condamne pas les autres : elle
    // est signalée, et le reste du groupe est placé.
    const usable = usableFormatOf(format, trimMm);
    const placeable = group.filter((item) => fitsIn(item, usable));
    unplaced.push(
      ...group.filter((item) => !fitsIn(item, usable)).map((item) => item.partId),
    );

    if (placeable.length > 0) {
      panels.push(...packGroup(placeable, format, kerfMm, trimMm));
    }
  }

  return { panels, kerfMm, unplaced };
}

function packGroup(
  items: Item[],
  format: PanelFormat,
  kerfMm: number,
  trimMm: number,
): NestedPanel[] {
  const usable = usableFormatOf(format, trimMm);
  // Décroissant par hauteur puis par largeur : les grandes pièces d'abord, sinon une
  // petite ouvre une bande haute qu'elle ne remplit pas.
  const sorted = [...items].sort(
    (a, b) => b.shortMm - a.shortMm || b.longMm - a.longMm,
  );

  const panels: { shelves: Shelf[]; placements: Placement2D[]; usedAreaMm2: number }[] =
    [];

  for (const item of sorted) {
    let placed = false;

    for (const panel of panels) {
      if (place(item, panel, usable, kerfMm)) {
        placed = true;
        break;
      }
    }

    if (!placed) {
      const panel = { shelves: [], placements: [], usedAreaMm2: 0 };
      panels.push(panel);
      // Le format a été choisi pour recevoir la plus grande pièce : un panneau neuf ne
      // peut pas refuser.
      place(item, panel, usable, kerfMm);
    }
  }

  const areaMm2 = format.lengthMm * format.widthMm;

  return panels.map((panel) => ({
    material: items[0]?.material as MaterialKey,
    thicknessMm: items[0]?.thicknessMm as number,
    format,
    usableFormat: usable,
    trimMm,
    // Les positions sont rendues dans le repère du panneau **acheté** : c'est celui que
    // l'opérateur a devant lui, et son coin est là où il pose son mètre.
    placements: panel.placements.map((placement) => ({
      ...placement,
      xMm: placement.xMm + trimMm,
      yMm: placement.yMm + trimMm,
    })),
    usedAreaMm2: panel.usedAreaMm2,
    areaMm2,
    utilisation: panel.usedAreaMm2 / areaMm2,
  }));
}

/**
 * Pose une pièce dans une bande existante, ou en ouvre une.
 *
 * L'orientation par défaut met la grande dimension le long de la longueur du panneau ;
 * la pièce est pivotée si, et seulement si, elle ne rentre pas autrement.
 */
function place(
  item: Item,
  panel: { shelves: Shelf[]; placements: Placement2D[]; usedAreaMm2: number },
  format: PanelFormat,
  kerfMm: number,
): boolean {
  for (const orientation of orientations(item)) {
    for (const shelf of panel.shelves) {
      // Une pièce plus haute que sa bande y ferait déborder la coupe traversante.
      if (orientation.sizeYMm > shelf.heightMm) continue;

      const xMm = shelf.cursorXMm;
      if (xMm + orientation.sizeXMm > format.lengthMm) continue;

      panel.placements.push({
        partId: item.partId,
        xMm,
        yMm: shelf.yMm,
        ...orientation,
      });
      panel.usedAreaMm2 += orientation.sizeXMm * orientation.sizeYMm;
      shelf.cursorXMm = xMm + orientation.sizeXMm + kerfMm;
      return true;
    }
  }

  // Aucune bande ouverte ne convient : en ouvrir une sous la dernière.
  const last = panel.shelves.at(-1);
  const yMm = last ? last.yMm + last.heightMm + kerfMm : 0;

  for (const orientation of orientations(item)) {
    if (yMm + orientation.sizeYMm > format.widthMm) continue;
    if (orientation.sizeXMm > format.lengthMm) continue;

    panel.shelves.push({
      yMm,
      heightMm: orientation.sizeYMm,
      cursorXMm: orientation.sizeXMm + kerfMm,
    });
    panel.placements.push({ partId: item.partId, xMm: 0, yMm, ...orientation });
    panel.usedAreaMm2 += orientation.sizeXMm * orientation.sizeYMm;
    return true;
  }

  return false;
}

function orientations(
  item: Item,
): { sizeXMm: number; sizeYMm: number; rotated: boolean }[] {
  if (item.longMm === item.shortMm) {
    return [{ sizeXMm: item.longMm, sizeYMm: item.shortMm, rotated: false }];
  }

  return [
    { sizeXMm: item.longMm, sizeYMm: item.shortMm, rotated: false },
    { sizeXMm: item.shortMm, sizeYMm: item.longMm, rotated: true },
  ];
}

/** La pièce entre-t-elle dans le format, dans un sens ou dans l'autre ? */
function fitsIn(item: Item, format: PanelFormat): boolean {
  return (
    (item.longMm <= format.lengthMm && item.shortMm <= format.widthMm) ||
    (item.longMm <= format.widthMm && item.shortMm <= format.lengthMm)
  );
}

/**
 * Le plus petit format qui reçoit toutes les pièces du groupe ; à défaut, le plus grand
 * disponible — celles qui n'y entrent toujours pas seront signalées.
 *
 * Un format imprimé en pouces vaut 2438,4 mm ; il est **tronqué** à l'entier inférieur.
 * Arrondir au supérieur ferait croire à un millimètre de panneau qui n'existe pas, et
 * c'est exactement celui qui manquerait à la dernière coupe.
 */
/** Le panneau une fois déligné, sur ses quatre rives. */
function usableFormatOf(format: PanelFormat, trimMm: number): PanelFormat {
  return {
    lengthMm: format.lengthMm - trimMm * 2,
    widthMm: format.widthMm - trimMm * 2,
  };
}

function chooseFormat(
  items: Item[],
  formats: readonly PanelFormat[],
  trimMm: number,
): PanelFormat | null {
  const usable = formats
    .map((format) => ({
      lengthMm: Math.floor(format.lengthMm),
      widthMm: Math.floor(format.widthMm),
    }))
    .sort((a, b) => a.lengthMm * a.widthMm - b.lengthMm * b.widthMm);

  return (
    usable.find((format) =>
      items.every((item) => fitsIn(item, usableFormatOf(format, trimMm))),
    ) ??
    usable.at(-1) ??
    null
  );
}

function groupBy(items: Item[]): Item[][] {
  const groups = new Map<string, Item[]>();

  for (const item of items) {
    const key = `${item.material}|${item.thicknessMm}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  return [...groups.values()];
}

/** Surface totale des pièces posées, tous panneaux confondus. */
export function totalUsedAreaMm2(result: NestingResult): number {
  return result.panels.reduce((total, panel) => total + panel.usedAreaMm2, 0);
}
