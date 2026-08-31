/**
 * Les dessins : plan de découpe en SVG pour l'écran, en PDF pour l'atelier.
 *
 * Aucune entrée-sortie, aucune dépendance de rendu : ce paquet rend des chaînes et des
 * octets. C'est ce qui permet de le tester sans navigateur et sans fichier.
 */
export { cutPlanPdf, cutPlanSvg, type PlanLabels } from './cut-plan.js';
export { renderPdf, type Page, type PdfDocument, type Shape } from './pdf.js';
