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
  joinery,
  DEFAULT_PARAMETERS,
  type Parameters,
  type AssemblyConvention,
  type Joinery,
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
  space,
  type CompartmentInput,
  type SpaceInput,
  type FurnitureInput,
  type ParsedFurnitureInput,
} from './input.js';

export {
  shelfDeflection,
  DEFLECTION_LIMIT_RATIO,
  type DeflectionResult,
} from './deflection.js';

export { build, compartmentAt, type Furniture, type Warning } from './build.js';

export { fittingWarnings, tiltHeightMm, type FittingCode } from './fitting.js';

export {
  tooling,
  compareTools,
  type SkillLevel,
  type ToolKey,
  type ToolLine,
  type ToolReason,
  type Tooling,
} from './tooling.js';

export { cutList, totalEdgeBandingMm, type CutListRow } from './cut-list.js';

export {
  cuttingOrder,
  STORE_MIN_CUT_MM,
  type CuttingOrder,
  type CuttingOrderGroup,
  type CuttingOrderPiece,
} from './cutting-order.js';

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
  SLIDE_LENGTHS_MM,
  SLIDES,
  HINGE,
  DOWEL,
  SCREW,
  SHELF_SUPPORT,
  hingesFor,
  hingePositionsMm,
  slideFor,
  barFor,
  pullFor,
  PULLS,
  PULL_BARS,
  PULL_KNOB,
  PULL_SHELL,
  PULL_CENTRES_MM,
  type PullSpec,
  type PullShape,
  type PullCentresMm,
  type HardwareKey,
  type HingeSpec,
  type SlideSpec,
  type SlideLengthMm,
  type DowelSpec,
  type ScrewSpec,
  type ShelfSupportSpec,
} from './hardware.js';

export {
  frameOf,
  toPartFrame,
  facingSide,
  oppositeFace,
  type Axis,
  type HoleSide,
  type PartFrame,
} from './part-frame.js';

export {
  facadesOf,
  facadeAt,
  hingeEdgeOf,
  type Facade,
  type FacadeRole,
} from './facades.js';

export {
  pulls,
  pullPlacement,
  suggestedPull,
  type PlacedPull,
  type PullPlacement,
  type PullPlacementInput,
  type PullResult,
  type PullWarning,
} from './pulls.js';

export {
  drilling,
  type DrilledPart,
  type DrillingResult,
  type DrillingWarning,
  type HardwareLine,
  type Hole,
  type HolePurpose,
  type Pocket,
} from './drilling.js';

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
