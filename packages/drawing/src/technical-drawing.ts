import type { Furniture } from '@neftya/engine';
import {
  dimensionsOf,
  type Dimension,
  type DimensionOptions,
  type DimensionedView,
  type PartDimension,
} from './dimensions.js';
import { project, VIEWS, type Projection, type ViewName } from './projection.js';

/**
 * Le plan technique : des vues projetées, cotées, et la table des pièces.
 *
 * Les vues portent les cotes du **meuble** — hors-tout et chaînes intermédiaires. La table
 * porte les cotes de **découpe** de chaque pièce. Les deux sont nécessaires : une élévation
 * dit où va une étagère, elle ne dit pas qu'il faut la scier à 873 × 382.
 *
 * @see docs/VISUALIZATION.md §3
 */

export interface TechnicalDrawing {
  views: DimensionedView[];
  parts: PartDimension[];
}

export interface DrawingOptions extends DimensionOptions {
  /** Les vues à produire. Les six par défaut. */
  views?: readonly ViewName[];
}

export function technicalDrawing(
  furniture: Furniture,
  options: DrawingOptions,
): TechnicalDrawing {
  const views = (options.views ?? VIEWS).map((view) => {
    const projection = project(furniture, view);
    return { view, projection, dimensions: dimensionsOf(projection, options) };
  });

  return {
    views,
    parts: furniture.parts.map((part) => ({
      partId: part.id,
      role: part.role,
      lengthMm: part.lengthMm,
      widthMm: part.widthMm,
      thicknessMm: part.thicknessMm,
      quantity: part.quantity,
    })),
  };
}

/** Écart entre deux lignes de cote, en millimètres du dessin. */
const LEVEL_STEP_MM = 46;
const FIRST_LEVEL_MM = 40;
const TEXT_SIZE_MM = 22;

/**
 * Une vue cotée, en SVG.
 *
 * Le dessin est en millimètres : les coordonnées **sont** les cotes, ce qui rend toute
 * erreur d'échelle visible d'un coup d'œil. Le `viewBox` est agrandi de la place que
 * prennent les cotes, sans quoi elles seraient rognées.
 */
export function technicalViewSvg(view: DimensionedView): string {
  const { projection, dimensions } = view;

  const horizontal = dimensions.filter((dimension) => dimension.axis === 'horizontal');
  const vertical = dimensions.filter((dimension) => dimension.axis === 'vertical');

  const belowMm = extent(horizontal);
  const leftMm = extent(vertical);
  const padMm = 30;

  const minX = -leftMm - padMm;
  const minY = -padMm;
  const width = projection.widthMm + leftMm + padMm * 2;
  const height = projection.heightMm + belowMm + padMm * 2;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" role="img">`,
    // Le repère du dessin technique a l'axe Y vers le haut ; celui du SVG vers le bas.
    // Le renversement est fait une fois, ici, plutôt que dans chaque coordonnée.
    `<g transform="translate(0 ${projection.heightMm}) scale(1 -1)">`,
    projection.rects.map(rectangle).join(''),
    `</g>`,
    horizontal.map((dimension) => horizontalDimension(dimension, projection)).join(''),
    vertical.map((dimension) => verticalDimension(dimension, projection)).join(''),
    '</svg>',
  ].join('');
}

function rectangle(rect: Projection['rects'][number]): string {
  return `<rect x="${rect.xMm}" y="${rect.yMm}" width="${rect.widthMm}" height="${rect.heightMm}" fill="#f5f5f4" stroke="#1c1917" stroke-width="3"/>`;
}

function horizontalDimension(dimension: Dimension, projection: Projection): string {
  // En SVG, plus bas veut dire Y plus grand.
  const yMm = projection.heightMm + FIRST_LEVEL_MM + dimension.level * LEVEL_STEP_MM;
  const centreMm = (dimension.fromMm + dimension.toMm) / 2;

  return [
    line(dimension.fromMm, yMm, dimension.toMm, yMm),
    tick(dimension.fromMm, yMm),
    tick(dimension.toMm, yMm),
    // Les lignes d'attache relient la cote à ce qu'elle mesure : sans elles, une cote
    // posée loin du dessin ne dit plus de quoi elle parle.
    witness(dimension.fromMm, projection.heightMm, yMm),
    witness(dimension.toMm, projection.heightMm, yMm),
    `<text x="${centreMm}" y="${yMm - 8}" font-size="${TEXT_SIZE_MM}" text-anchor="middle" fill="#1c1917">${escapeXml(
      dimension.label,
    )}</text>`,
  ].join('');
}

function verticalDimension(dimension: Dimension, projection: Projection): string {
  const xMm = -FIRST_LEVEL_MM - dimension.level * LEVEL_STEP_MM;
  const centreMm = projection.heightMm - (dimension.fromMm + dimension.toMm) / 2;
  const fromY = projection.heightMm - dimension.fromMm;
  const toY = projection.heightMm - dimension.toMm;

  return [
    line(xMm, fromY, xMm, toY),
    tick(xMm, fromY, true),
    tick(xMm, toY, true),
    `<line x1="${xMm}" y1="${fromY}" x2="0" y2="${fromY}" stroke="#a8a29e" stroke-width="1.5"/>`,
    `<line x1="${xMm}" y1="${toY}" x2="0" y2="${toY}" stroke="#a8a29e" stroke-width="1.5"/>`,
    `<text x="${xMm - 8}" y="${centreMm}" font-size="${TEXT_SIZE_MM}" text-anchor="middle" fill="#1c1917" transform="rotate(-90 ${
      xMm - 8
    } ${centreMm})">${escapeXml(dimension.label)}</text>`,
  ].join('');
}

function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1c1917" stroke-width="2"/>`;
}

function tick(xMm: number, yMm: number, vertical = false): string {
  const half = 7;

  return vertical
    ? `<line x1="${xMm - half}" y1="${yMm}" x2="${xMm + half}" y2="${yMm}" stroke="#1c1917" stroke-width="2"/>`
    : `<line x1="${xMm}" y1="${yMm - half}" x2="${xMm}" y2="${yMm + half}" stroke="#1c1917" stroke-width="2"/>`;
}

function witness(xMm: number, drawingHeightMm: number, yMm: number): string {
  return `<line x1="${xMm}" y1="${drawingHeightMm}" x2="${xMm}" y2="${yMm}" stroke="#a8a29e" stroke-width="1.5"/>`;
}

function extent(dimensions: Dimension[]): number {
  const levels = dimensions.map((dimension) => dimension.level);
  return FIRST_LEVEL_MM + (Math.max(-1, ...levels) + 1) * LEVEL_STEP_MM;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
