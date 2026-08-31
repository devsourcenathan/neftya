import { PAPER_FORMATS, type PaperSize } from '@neftya/units';
import type { Dimension, DimensionedView, PartDimension } from './dimensions.js';
import { renderPdf, type Page, type Shape } from './pdf.js';
import type { TechnicalDrawing } from './technical-drawing.js';

/**
 * Le plan technique en PDF : une page par vue, puis la table des pièces.
 *
 * La géométrie vient de la même cotation que le SVG affiché à l'écran. Deux mises en page
 * indépendantes finiraient par diverger, et l'atelier percerait d'après un plan que
 * personne n'a regardé.
 *
 * @see docs/VISUALIZATION.md §3
 */

export interface SheetLabels {
  title: string;
  /** Nom de la vue, traduit par l'appelant. */
  view: (view: DimensionedView['view']) => string;
  partsTitle: string;
  /** En-têtes de la table des pièces, dans l'ordre des colonnes. */
  columns: [string, string, string, string, string];
}

const MARGIN_PT = 36;
const HEADER_PT = 54;
const LEVEL_STEP_MM = 46;
const FIRST_LEVEL_MM = 40;

export function technicalDrawingPdf(
  drawing: TechnicalDrawing,
  labels: SheetLabels,
  paper: PaperSize = 'a4',
): Uint8Array {
  const format = PAPER_FORMATS[paper];
  // Paysage : un meuble est plus large que haut, et une élévation cotée l'est encore plus.
  const widthPt = format.heightPt;
  const heightPt = format.widthPt;

  const pages: Page[] = drawing.views.map((view) =>
    viewPage(view, labels, widthPt, heightPt),
  );

  pages.push(partsPage(drawing.parts, labels, widthPt, heightPt));

  return renderPdf({ title: labels.title, pages });
}

function viewPage(
  view: DimensionedView,
  labels: SheetLabels,
  widthPt: number,
  heightPt: number,
): Page {
  const { projection, dimensions } = view;

  // L'emprise à faire tenir dans la page : le dessin, plus la place que prennent les cotes.
  const leftMm = spaceFor(dimensions, 'vertical');
  const belowMm = spaceFor(dimensions, 'horizontal');
  const totalWidthMm = projection.widthMm + leftMm;
  const totalHeightMm = projection.heightMm + belowMm;

  const scale = Math.min(
    (widthPt - MARGIN_PT * 2) / totalWidthMm,
    (heightPt - MARGIN_PT * 2 - HEADER_PT) / totalHeightMm,
  );

  // Origine du dessin dans la page : au-dessus de la bande des cotes, à droite de la
  // colonne des cotes verticales.
  const originXPt = MARGIN_PT + leftMm * scale;
  const originYPt = MARGIN_PT + belowMm * scale;

  const x = (mm: number) => originXPt + mm * scale;
  const y = (mm: number) => originYPt + mm * scale;

  const shapes: Shape[] = [
    {
      kind: 'text',
      xPt: MARGIN_PT,
      yPt: heightPt - MARGIN_PT,
      sizePt: 12,
      text: labels.title,
      bold: true,
    },
    {
      kind: 'text',
      xPt: MARGIN_PT,
      yPt: heightPt - MARGIN_PT - 16,
      sizePt: 9,
      text: labels.view(view.view),
      grey: 0.3,
    },
  ];

  for (const rect of projection.rects) {
    shapes.push({
      kind: 'rect',
      xPt: x(rect.xMm),
      yPt: y(rect.yMm),
      widthPt: rect.widthMm * scale,
      heightPt: rect.heightMm * scale,
      fill: 0.95,
      stroke: 0.1,
      lineWidthPt: 0.6,
    });
  }

  for (const dimension of dimensions) {
    const offsetMm = FIRST_LEVEL_MM + dimension.level * LEVEL_STEP_MM;
    const textMm = 22;

    if (dimension.axis === 'horizontal') {
      const yPt = y(-offsetMm);
      shapes.push(
        {
          kind: 'line',
          x1Pt: x(dimension.fromMm),
          y1Pt: yPt,
          x2Pt: x(dimension.toMm),
          y2Pt: yPt,
        },
        // Les lignes d'attache : sans elles, une cote posée loin du dessin ne dit plus de
        // quoi elle parle.
        {
          kind: 'line',
          x1Pt: x(dimension.fromMm),
          y1Pt: yPt,
          x2Pt: x(dimension.fromMm),
          y2Pt: y(0),
          stroke: 0.6,
        },
        {
          kind: 'line',
          x1Pt: x(dimension.toMm),
          y1Pt: yPt,
          x2Pt: x(dimension.toMm),
          y2Pt: y(0),
          stroke: 0.6,
        },
        {
          kind: 'text',
          // Le texte est centré à la main : le PDF n'a pas d'alignement, il pose des
          // caractères à une position.
          xPt:
            x((dimension.fromMm + dimension.toMm) / 2) -
            (dimension.label.length * textMm * scale) / 4,
          yPt: yPt + 3,
          sizePt: Math.max(5, textMm * scale * 0.6),
          text: dimension.label,
        },
      );
      continue;
    }

    const xPt = x(-offsetMm);
    shapes.push(
      {
        kind: 'line',
        x1Pt: xPt,
        y1Pt: y(dimension.fromMm),
        x2Pt: xPt,
        y2Pt: y(dimension.toMm),
      },
      {
        kind: 'line',
        x1Pt: xPt,
        y1Pt: y(dimension.fromMm),
        x2Pt: x(0),
        y2Pt: y(dimension.fromMm),
        stroke: 0.6,
      },
      {
        kind: 'line',
        x1Pt: xPt,
        y1Pt: y(dimension.toMm),
        x2Pt: x(0),
        y2Pt: y(dimension.toMm),
        stroke: 0.6,
      },
      {
        // Le texte des cotes verticales n'est pas pivoté : le faire demanderait une
        // matrice de texte, et une cote lisible à l'horizontale reste lisible.
        kind: 'text',
        xPt: xPt + 2,
        yPt: y((dimension.fromMm + dimension.toMm) / 2),
        sizePt: Math.max(5, textMm * scale * 0.6),
        text: dimension.label,
      },
    );
  }

  return { widthPt, heightPt, shapes };
}

/** La table des pièces : ce qu'aucune élévation ne dit — à quelle cote scier. */
function partsPage(
  parts: PartDimension[],
  labels: SheetLabels,
  widthPt: number,
  heightPt: number,
): Page {
  const shapes: Shape[] = [
    {
      kind: 'text',
      xPt: MARGIN_PT,
      yPt: heightPt - MARGIN_PT,
      sizePt: 12,
      text: labels.partsTitle,
      bold: true,
    },
  ];

  const columns = [
    MARGIN_PT,
    MARGIN_PT + 90,
    MARGIN_PT + 200,
    MARGIN_PT + 290,
    MARGIN_PT + 380,
  ];
  let yPt = heightPt - MARGIN_PT - 32;

  for (const [index, column] of columns.entries()) {
    shapes.push({
      kind: 'text',
      xPt: column,
      yPt,
      sizePt: 8,
      text: labels.columns[index] ?? '',
      bold: true,
    });
  }

  yPt -= 6;
  shapes.push({
    kind: 'line',
    x1Pt: MARGIN_PT,
    y1Pt: yPt,
    x2Pt: widthPt - MARGIN_PT,
    y2Pt: yPt,
  });

  for (const part of parts) {
    yPt -= 14;
    // Une page pleine s'arrête plutôt que d'écrire par-dessus la marge.
    if (yPt < MARGIN_PT) break;

    const cells = [
      part.partId,
      part.role,
      `${part.lengthMm} x ${part.widthMm}`,
      `${part.thicknessMm}`,
      `${part.quantity}`,
    ];

    for (const [index, column] of columns.entries()) {
      shapes.push({
        kind: 'text',
        xPt: column,
        yPt,
        sizePt: 8,
        text: cells[index] ?? '',
      });
    }
  }

  return { widthPt, heightPt, shapes };
}

function spaceFor(dimensions: Dimension[], axis: Dimension['axis']): number {
  const levels = dimensions
    .filter((dimension) => dimension.axis === axis)
    .map((dimension) => dimension.level);

  return FIRST_LEVEL_MM + (Math.max(-1, ...levels) + 1) * LEVEL_STEP_MM;
}
