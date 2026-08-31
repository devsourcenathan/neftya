/**
 * Neftya Engine — moteur paramétrique.
 *
 * Pur : aucune entrée-sortie, aucune horloge, aucun aléatoire. Il prend des données et
 * rend des données, ce qui lui permet de tourner dans le navigateur pour l'interaction
 * et sur le serveur pour ce qui fait foi, avec le même code.
 *
 * @see docs/NEFTYA_ENGINE.md
 * @see docs/ENGINEERING.md §2
 */
export {
  millimetres,
  positiveMillimetres,
  recomposes,
  divideEvenly,
  type Millimetres,
} from './millimetres.js';

export {
  materialKey,
  YOUNG_MODULUS,
  PANEL_THICKNESSES_MM,
  PANEL_FORMATS_MM,
  type MaterialKey,
} from './materials.js';

export {
  parameters,
  assemblyConvention,
  DEFAULT_PARAMETERS,
  type Parameters,
  type AssemblyConvention,
} from './parameters.js';

export {
  partRole,
  grain,
  edge,
  partSignature,
  type Part,
  type PartRole,
  type Grain,
  type Edge,
  type Placement,
} from './parts.js';

export {
  compartment,
  furnitureInput,
  type CompartmentInput,
  type FurnitureInput,
  type ParsedFurnitureInput,
} from './input.js';

export {
  shelfDeflection,
  DEFLECTION_LIMIT_RATIO,
  type DeflectionResult,
} from './deflection.js';

export { build, type Furniture, type Warning } from './build.js';

export { cutList, totalEdgeBandingMm, type CutListRow } from './cut-list.js';

export { nestingViolations, panelViolations } from './nesting-properties.js';

export {
  nest,
  totalUsedAreaMm2,
  type NestedPanel,
  type NestingOptions,
  type NestingResult,
  type PanelFormat,
  type Placement2D,
} from './nesting.js';

export {
  billOfMaterials,
  type AccessoryKey,
  type AccessoryLine,
  type BillOfMaterials,
  type PanelLine,
} from './bill-of-materials.js';

export { costLines, type CostLine, type CostUnit } from './costing.js';

export {
  assemblySteps,
  DEFAULT_ASSEMBLY,
  type AssemblyStep,
  type AssemblyStepTemplate,
} from './assembly.js';
