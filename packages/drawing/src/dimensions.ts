import type { Projection, ProjectedRect, ViewName } from './projection.js';

/**
 * La cotation, et le seul problème difficile de la phase : **placer des cotes sans qu'aucune
 * n'en chevauche une autre**.
 *
 * La solution est la même que pour le placement des pièces sur un panneau, et pour la même
 * raison : des **niveaux** — des lignes de cote parallèles, à distance croissante du dessin.
 * Une cote est posée sur le premier niveau où son emprise ne rencontre celle d'aucune autre.
 * L'absence de chevauchement est donc obtenue **par construction**, et non vérifiée après
 * coup ; le test qui l'éprouve n'a plus qu'à confirmer que la construction tient.
 *
 * L'emprise d'une cote n'est pas son intervalle : c'est le plus large de son intervalle et
 * de son étiquette. Une cote de 3 mm porte un texte de vingt millimètres de long, et deux
 * cotes voisines qui ne se chevauchent pas peuvent très bien avoir des textes qui se
 * superposent.
 *
 * @see docs/VISUALIZATION.md §5
 * @see docs/IMPLEMENTATION.md — phase 5
 */

export type DimensionAxis = 'horizontal' | 'vertical';

/** De quel côté du dessin la cote est portée. */
export type DimensionSide = 'below' | 'left';

export interface Dimension {
  axis: DimensionAxis;
  side: DimensionSide;
  /** Bornes de la cote, dans le repère du dessin, en millimètres. */
  fromMm: number;
  toMm: number;
  valueMm: number;
  label: string;
  /** Ce que la cote mesure : hors-tout, entraxe, épaisseur… Sert au style du trait. */
  kind: DimensionKind;
  /** Niveau d'éloignement, 0 étant la ligne la plus proche du dessin. */
  level: number;
}

export type DimensionKind = 'overall' | 'chain' | 'part';

export interface DimensionOptions {
  /** Formate la valeur. Les unités sont une affaire d'appelant, pas de dessin. */
  label: (valueMm: number) => string;
  /** Largeur d'un caractère, en millimètres du dessin. */
  characterWidthMm?: number;
  /** Marge de respiration entre deux emprises voisines. */
  gapMm?: number;
}

/**
 * Largeur d'un caractère à la taille de texte du rendu.
 *
 * Elle **doit** correspondre à ce que le dessin trace : c'est sur cette estimation que
 * repose la garantie de non-chevauchement. La sous-estimer donnerait un plan où les cotes
 * ne se chevauchent qu'en théorie.
 */
export const DEFAULT_CHARACTER_WIDTH_MM = 12;
export const DEFAULT_GAP_MM = 4;

/**
 * Les cotes d'une vue : hors-tout, puis les chaînes intermédiaires.
 *
 * Les chaînes sont construites à partir des **panneaux structurels** de la vue — côtés et
 * séparations pour l'horizontale, dessous, étagères et dessus pour la verticale. Coter
 * chaque arête de chaque pièce donnerait un plan illisible, ce qui revient à ne rien coter.
 */
export function dimensionsOf(
  projection: Projection,
  options: DimensionOptions,
): Dimension[] {
  const label = options.label;
  const raw: Omit<Dimension, 'level'>[] = [];

  raw.push({
    axis: 'horizontal',
    side: 'below',
    fromMm: 0,
    toMm: projection.widthMm,
    valueMm: projection.widthMm,
    label: label(projection.widthMm),
    kind: 'overall',
  });

  raw.push({
    axis: 'vertical',
    side: 'left',
    fromMm: 0,
    toMm: projection.heightMm,
    valueMm: projection.heightMm,
    label: label(projection.heightMm),
    kind: 'overall',
  });

  for (const segment of chainAlong(projection, 'horizontal')) {
    raw.push({
      axis: 'horizontal',
      side: 'below',
      ...segment,
      label: label(segment.valueMm),
      kind: 'chain',
    });
  }

  for (const segment of chainAlong(projection, 'vertical')) {
    raw.push({
      axis: 'vertical',
      side: 'left',
      ...segment,
      label: label(segment.valueMm),
      kind: 'chain',
    });
  }

  return place(raw, options);
}

/** Les rôles qui structurent chaque direction. Un tiroir ne définit pas un compartiment. */
const STRUCTURAL: Record<DimensionAxis, readonly string[]> = {
  horizontal: ['side', 'divider'],
  vertical: ['bottom', 'top', 'shelf'],
};

/**
 * La chaîne de cotes le long d'un axe : chaque panneau, puis chaque vide entre deux
 * panneaux, bout à bout.
 *
 * La somme de la chaîne fait le hors-tout — c'est ce qui rend une chaîne vérifiable, et
 * c'est ce qu'un menuisier contrôle d'abord.
 */
function chainAlong(
  projection: Projection,
  axis: DimensionAxis,
): { fromMm: number; toMm: number; valueMm: number }[] {
  const total = axis === 'horizontal' ? projection.widthMm : projection.heightMm;

  const spans = projection.rects
    .filter((rect) => STRUCTURAL[axis].includes(rect.role))
    .map((rect) => spanOf(rect, axis))
    .filter((span) => span.toMm > span.fromMm)
    .sort((a, b) => a.fromMm - b.fromMm);

  const merged = merge(spans);
  if (merged.length === 0) return [];

  const segments: { fromMm: number; toMm: number }[] = [];
  let cursor = 0;

  for (const span of merged) {
    if (span.fromMm > cursor) segments.push({ fromMm: cursor, toMm: span.fromMm });
    segments.push({ fromMm: span.fromMm, toMm: span.toMm });
    cursor = span.toMm;
  }

  if (cursor < total) segments.push({ fromMm: cursor, toMm: total });

  // Une chaîne d'un seul segment répète le hors-tout : elle n'apprend rien.
  if (segments.length < 2) return [];

  return segments.map((segment) => ({
    ...segment,
    valueMm: segment.toMm - segment.fromMm,
  }));
}

function spanOf(
  rect: ProjectedRect,
  axis: DimensionAxis,
): { fromMm: number; toMm: number } {
  return axis === 'horizontal'
    ? { fromMm: rect.xMm, toMm: rect.xMm + rect.widthMm }
    : { fromMm: rect.yMm, toMm: rect.yMm + rect.heightMm };
}

/** Deux côtés à la même abscisse — les deux instances d'une même pièce — n'en font qu'un. */
function merge(
  spans: { fromMm: number; toMm: number }[],
): { fromMm: number; toMm: number }[] {
  const merged: { fromMm: number; toMm: number }[] = [];

  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span.fromMm <= last.toMm) {
      last.toMm = Math.max(last.toMm, span.toMm);
    } else {
      merged.push({ ...span });
    }
  }

  return merged;
}

/**
 * Le placement par niveaux : la même mécanique que les bandes du plan de découpe.
 *
 * Les cotes hors-tout passent en premier et occupent les niveaux extérieurs ; les chaînes
 * se rangent au plus près du dessin. C'est la convention du dessin technique, et elle a une
 * raison pratique : la cote qu'on lit le plus souvent est celle qu'on cherche le moins
 * longtemps.
 */
function place(
  dimensions: Omit<Dimension, 'level'>[],
  options: DimensionOptions,
): Dimension[] {
  const characterWidthMm = options.characterWidthMm ?? DEFAULT_CHARACTER_WIDTH_MM;
  const gapMm = options.gapMm ?? DEFAULT_GAP_MM;

  const placed: Dimension[] = [];
  // Une occupation par (axe, côté, niveau).
  const occupancy = new Map<string, { fromMm: number; toMm: number }[]>();

  const ordered = [...dimensions].sort(
    (a, b) => order(a.kind) - order(b.kind) || a.fromMm - b.fromMm,
  );

  for (const dimension of ordered) {
    const footprint = footprintOf(dimension, characterWidthMm, gapMm);

    let level = 0;
    for (;;) {
      const key = `${dimension.axis}|${dimension.side}|${level}`;
      const taken = occupancy.get(key) ?? [];

      if (
        taken.every(
          (other) => footprint.toMm <= other.fromMm || footprint.fromMm >= other.toMm,
        )
      ) {
        taken.push(footprint);
        occupancy.set(key, taken);
        placed.push({ ...dimension, level });
        break;
      }

      level += 1;
    }
  }

  return placed;
}

function order(kind: DimensionKind): number {
  return kind === 'chain' ? 0 : 1;
}

/**
 * L'emprise réelle d'une cote : le plus large de son intervalle et de son étiquette,
 * centrés au même endroit, plus une marge.
 *
 * C'est **là** que se joue l'absence de chevauchement. Une cote de 3 mm porte un texte de
 * vingt millimètres : raisonner sur l'intervalle seul poserait deux cotes voisines sur le
 * même niveau et superposerait leurs textes.
 */
function footprintOf(
  dimension: Omit<Dimension, 'level'>,
  characterWidthMm: number,
  gapMm: number,
): { fromMm: number; toMm: number } {
  const centreMm = (dimension.fromMm + dimension.toMm) / 2;
  const spanMm = dimension.toMm - dimension.fromMm;
  const labelMm = dimension.label.length * characterWidthMm;
  const widthMm = Math.max(spanMm, labelMm) + gapMm;

  return { fromMm: centreMm - widthMm / 2, toMm: centreMm + widthMm / 2 };
}

/** Les cotes de découpe de chaque pièce : ce qui manque aux vues pour scier. */
export interface PartDimension {
  partId: string;
  role: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  quantity: number;
}

export interface DimensionedView {
  view: ViewName;
  projection: Projection;
  dimensions: Dimension[];
}
