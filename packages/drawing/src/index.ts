/**
 * Les dessins : plan de découpe en SVG pour l'écran, en PDF pour l'atelier.
 *
 * Aucune entrée-sortie, aucune dépendance de rendu : ce paquet rend des chaînes et des
 * octets. C'est ce qui permet de le tester sans navigateur et sans fichier.
 */
export { cutPlanPdf, cutPlanSvg, type PlanLabels } from './cut-plan.js';
export { renderPdf, type Page, type PdfDocument, type Shape } from './pdf.js';
export {
  project,
  VIEWS,
  type ProjectedRect,
  type Projection,
  type ViewName,
} from './projection.js';
export {
  dimensionsOf,
  DEFAULT_CHARACTER_WIDTH_MM,
  DEFAULT_GAP_MM,
  type Dimension,
  type DimensionAxis,
  type DimensionKind,
  type DimensionOptions,
  type DimensionSide,
  type DimensionedView,
  type PartDimension,
} from './dimensions.js';
export {
  technicalDrawing,
  technicalViewSvg,
  type DrawingOptions,
  type TechnicalDrawing,
} from './technical-drawing.js';
export { technicalDrawingPdf, type SheetLabels } from './plan-sheet.js';
