import { build } from '../../packages/engine/dist/build.js';
import { nest } from '../../packages/engine/dist/nesting.js';
import { cutPlanSvg } from '../../packages/drawing/dist/cut-plan.js';
import { writeFileSync } from 'node:fs';

const furniture = build({
  dimensions: { widthMm: 2000, heightMm: 2200, depthMm: 500 },
  compartments: [
    { shelves: 3, doors: 2 },
    { shelves: 2, drawers: 2, doors: 1 },
    { shelves: 3, doors: 1 },
  ],
  material: 'mdf',
  hasBack: true,
});

const panels = nest(furniture).panels.filter((p) => p.thicknessMm === 18);
const panel = panels.sort((a, b) => b.placements.length - a.placements.length)[0];

console.log(
  'panneaux 18mm:',
  panels.length,
  '| pieces retenues:',
  panel.placements.length,
  '| rendement:',
  (panel.utilisation * 100).toFixed(1) + '%',
);

writeFileSync(
  process.argv[2],
  cutPlanSvg(panel, {
    title: '',
    panel: () => '',
    part: (pl) => ` · ${pl.sizeXMm} × ${pl.sizeYMm}`,
  }),
);
