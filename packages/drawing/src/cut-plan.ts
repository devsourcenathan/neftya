import type { NestedPanel, NestingResult } from '@neftya/engine';
import { PAPER_FORMATS, type PaperSize } from '@neftya/units';
import { renderPdf, type Page, type Shape } from './pdf.js';

/**
 * Le plan de découpe, en une seule géométrie et deux rendus.
 *
 * SVG pour l'écran, PDF pour l'atelier — mais **la mise en page est calculée une fois**.
 * Deux calculs indépendants finiraient par diverger, et l'atelier scierait d'après un plan
 * que personne n'a regardé à l'écran.
 *
 * @see docs/MANUFACTURING.md §2, §6
 */

export interface PlanLabels {
  /** Titre du document. Traduit par l'appelant : ce paquet ne connaît aucune langue. */
  title: string;
  /** Une ligne par panneau : « MDF 18 mm — 2440 × 1220 — 93,2 % ». */
  panel: (panel: NestedPanel, index: number, total: number) => string;
  /** Ce qui suit l'identifiant sur chaque pièce, par exemple ses cotes. */
  part: (placement: { partId: string; sizeXMm: number; sizeYMm: number }) => string;
}

interface Layout {
  /** Millimètres par point : le plan est réduit pour tenir dans la page. */
  scale: number;
  offsetXPt: number;
  offsetYPt: number;
  widthPt: number;
  heightPt: number;
}

const MARGIN_PT = 32;
const HEADER_PT = 48;

/** Une page par panneau : deux panneaux sur une feuille seraient illisibles à l'atelier. */
export function cutPlanPdf(
  nesting: NestingResult,
  labels: PlanLabels,
  paper: PaperSize = 'a4',
): Uint8Array {
  const format = PAPER_FORMATS[paper];

  const pages: Page[] = nesting.panels.map((panel, index) => {
    // Paysage : un panneau est deux fois plus long que large.
    const widthPt = format.heightPt;
    const heightPt = format.widthPt;
    const layout = fit(panel, widthPt, heightPt);

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
        text: labels.panel(panel, index + 1, nesting.panels.length),
        grey: 0.3,
      },
      {
        kind: 'rect',
        xPt: layout.offsetXPt,
        yPt: layout.offsetYPt,
        widthPt: layout.widthPt,
        heightPt: layout.heightPt,
        stroke: 0,
        lineWidthPt: 1,
      },
    ];

    for (const placement of panel.placements) {
      const xPt = layout.offsetXPt + placement.xMm * layout.scale;
      const yPt = layout.offsetYPt + placement.yMm * layout.scale;
      const wPt = placement.sizeXMm * layout.scale;
      const hPt = placement.sizeYMm * layout.scale;

      shapes.push({
        kind: 'rect',
        xPt,
        yPt,
        widthPt: wPt,
        heightPt: hPt,
        fill: 0.92,
        stroke: 0.2,
      });

      // L'étiquette n'est posée que si elle tient : un texte débordant sur la pièce
      // voisine se lit comme appartenant à celle-ci, et fait scier de travers.
      if (wPt > 44 && hPt > 16) {
        shapes.push({
          kind: 'text',
          xPt: xPt + 4,
          yPt: yPt + hPt - 11,
          sizePt: 7,
          text: placement.partId,
          bold: true,
        });
        shapes.push({
          kind: 'text',
          xPt: xPt + 4,
          yPt: yPt + hPt - 20,
          sizePt: 6,
          text: labels.part(placement),
          grey: 0.35,
        });
      }
    }

    return { widthPt, heightPt, shapes };
  });

  return renderPdf({ title: labels.title, pages });
}

/** Le même plan, pour l'écran. Une balise `<svg>` par panneau. */
export function cutPlanSvg(panel: NestedPanel, labels: PlanLabels): string {
  const parts = panel.placements
    .map((placement) => {
      const label =
        placement.sizeXMm > 200 && placement.sizeYMm > 80
          ? `<text x="${placement.xMm + 12}" y="${placement.yMm + 40}" font-size="28" fill="#44403c">${escapeXml(
              placement.partId,
            )}</text><text x="${placement.xMm + 12}" y="${placement.yMm + 74}" font-size="22" fill="#78716c">${escapeXml(
              labels.part(placement),
            )}</text>`
          : '';

      return `<g><rect x="${placement.xMm}" y="${placement.yMm}" width="${placement.sizeXMm}" height="${placement.sizeYMm}" fill="#eeece7" stroke="#57534e" stroke-width="2"/>${label}</g>`;
    })
    .join('');

  // `viewBox` en millimètres : les cotes du plan sont les coordonnées du dessin, ce qui
  // rend toute erreur d'échelle visible immédiatement.
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${panel.format.lengthMm} ${panel.format.widthMm}" role="img">`,
    `<rect x="0" y="0" width="${panel.format.lengthMm}" height="${panel.format.widthMm}" fill="#ffffff" stroke="#1c1917" stroke-width="4"/>`,
    parts,
    '</svg>',
  ].join('');
}

/** Ajuste le panneau à la page, en conservant les proportions. */
function fit(panel: NestedPanel, pageWidthPt: number, pageHeightPt: number): Layout {
  const availableWidthPt = pageWidthPt - MARGIN_PT * 2;
  const availableHeightPt = pageHeightPt - MARGIN_PT * 2 - HEADER_PT;

  const scale = Math.min(
    availableWidthPt / panel.format.lengthMm,
    availableHeightPt / panel.format.widthMm,
  );

  const widthPt = panel.format.lengthMm * scale;
  const heightPt = panel.format.widthMm * scale;

  return {
    scale,
    offsetXPt: MARGIN_PT,
    offsetYPt: MARGIN_PT,
    widthPt,
    heightPt,
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
