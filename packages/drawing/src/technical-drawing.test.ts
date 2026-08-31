import { describe, it, expect } from 'vitest';
import { build, type FurnitureInput } from '@neftya/engine';
import type { Dimension } from './dimensions.js';
import { project, VIEWS } from './projection.js';
import { technicalDrawing, technicalViewSvg } from './technical-drawing.js';

/**
 * Le critère de sortie de la phase 5, en test :
 *
 * > Sur vingt meubles de formes différentes, **aucune cote n'en chevauche une autre** et
 * > chaque pièce porte les cotes nécessaires à sa découpe.
 *
 * Les vingt meubles sont écrits à la main, pas tirés au sort : ils couvrent des formes
 * qu'un générateur aléatoire produirait rarement — le meuble d'un seul compartiment, celui
 * qui est plus haut que large, le très plat, celui qui n'a que des tiroirs.
 */

/**
 * Les paramètres d'emprise sont **donnés** au lieu d'être hérités, et la géométrie est
 * recalculée ici, à la main.
 *
 * La première version de ce test appelait la fonction d'emprise de la production : elle
 * mesurait donc l'algorithme contre lui-même. Remplacer l'emprise par le seul intervalle
 * — en oubliant l'étiquette, exactement le piège que ce code doit éviter — laissait les
 * soixante-douze tests au vert.
 */
const CHARACTER_WIDTH_MM = 12;
const GAP_MM = 4;

const LABEL = {
  label: (valueMm: number) => `${valueMm} mm`,
  characterWidthMm: CHARACTER_WIDTH_MM,
  gapMm: GAP_MM,
};

/** Vingt formes, choisies pour ce qu'elles ont de gênant. */
const SHAPES: { name: string; input: FurnitureInput }[] = [
  {
    name: 'référence',
    input: {
      dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
      compartments: [
        { shelves: 1, drawers: 0 },
        { shelves: 1, drawers: 0 },
      ],
    },
  },
  {
    name: 'un seul compartiment',
    input: {
      dimensions: { widthMm: 600, heightMm: 800, depthMm: 300 },
      compartments: [{ shelves: 2, drawers: 0 }],
    },
  },
  {
    name: 'sans étagère ni tiroir',
    input: {
      dimensions: { widthMm: 900, heightMm: 900, depthMm: 400 },
      compartments: [{ shelves: 0, drawers: 0 }],
    },
  },
  {
    name: 'bibliothèque haute',
    input: {
      dimensions: { widthMm: 1200, heightMm: 2400, depthMm: 300 },
      compartments: [
        { shelves: 6, drawers: 0 },
        { shelves: 6, drawers: 0 },
      ],
    },
  },
  {
    name: 'très plat',
    input: {
      dimensions: { widthMm: 2400, heightMm: 320, depthMm: 350 },
      compartments: [
        { shelves: 0, drawers: 0 },
        { shelves: 0, drawers: 0 },
        { shelves: 0, drawers: 0 },
      ],
    },
  },
  {
    name: 'très étroit',
    input: {
      dimensions: { widthMm: 320, heightMm: 1800, depthMm: 300 },
      compartments: [{ shelves: 5, drawers: 0 }],
    },
  },
  {
    name: 'douze compartiments',
    input: {
      dimensions: { widthMm: 3600, heightMm: 2000, depthMm: 400 },
      compartments: Array.from({ length: 12 }, () => ({ shelves: 1, drawers: 0 })),
    },
  },
  {
    name: 'compartiments serrés',
    input: {
      dimensions: { widthMm: 900, heightMm: 1800, depthMm: 350 },
      compartments: Array.from({ length: 5 }, () => ({ shelves: 2, drawers: 0 })),
    },
  },
  {
    name: 'que des tiroirs',
    input: {
      dimensions: { widthMm: 1000, heightMm: 900, depthMm: 500 },
      compartments: [
        { shelves: 0, drawers: 4 },
        { shelves: 0, drawers: 4 },
      ],
    },
  },
  {
    name: 'tiroirs et étagères mêlés',
    input: {
      dimensions: { widthMm: 1600, heightMm: 1400, depthMm: 450 },
      compartments: [
        { shelves: 3, drawers: 0 },
        { shelves: 1, drawers: 2 },
        { shelves: 0, drawers: 3 },
      ],
    },
  },
  {
    name: 'sans fond',
    input: {
      dimensions: { widthMm: 1400, heightMm: 1000, depthMm: 400 },
      compartments: [
        { shelves: 2, drawers: 0 },
        { shelves: 2, drawers: 0 },
      ],
      hasBack: false,
    },
  },
  {
    name: 'profond',
    input: {
      dimensions: { widthMm: 1200, heightMm: 1200, depthMm: 800 },
      compartments: [
        { shelves: 1, drawers: 1 },
        { shelves: 1, drawers: 1 },
      ],
    },
  },
  {
    name: 'peu profond',
    input: {
      dimensions: { widthMm: 1500, heightMm: 1500, depthMm: 120 },
      compartments: [
        { shelves: 4, drawers: 0 },
        { shelves: 4, drawers: 0 },
      ],
    },
  },
  {
    name: 'contreplaqué épais',
    input: {
      dimensions: { widthMm: 1600, heightMm: 800, depthMm: 400 },
      compartments: [
        { shelves: 1, drawers: 0 },
        { shelves: 1, drawers: 0 },
      ],
      material: 'plywood',
      parameters: { panelThicknessMm: 25 },
    },
  },
  {
    name: 'panneaux fins',
    input: {
      dimensions: { widthMm: 1000, heightMm: 1000, depthMm: 300 },
      compartments: [
        { shelves: 2, drawers: 0 },
        { shelves: 2, drawers: 0 },
      ],
      parameters: { panelThicknessMm: 8, backThicknessMm: 8, backSetbackMm: 8 },
    },
  },
  {
    name: 'trait de scie large',
    input: {
      dimensions: { widthMm: 1800, heightMm: 900, depthMm: 400 },
      compartments: [
        { shelves: 1, drawers: 1 },
        { shelves: 1, drawers: 1 },
      ],
      parameters: { kerfMm: 5 },
    },
  },
  {
    name: 'avec pieds',
    input: {
      dimensions: { widthMm: 1200, heightMm: 700, depthMm: 400 },
      compartments: [
        { shelves: 1, drawers: 0 },
        { shelves: 0, drawers: 2 },
      ],
      parameters: { legHeightMm: 120 },
    },
  },
  {
    name: 'cube minimal',
    input: {
      dimensions: { widthMm: 300, heightMm: 300, depthMm: 300 },
      compartments: [{ shelves: 0, drawers: 0 }],
    },
  },
  {
    name: 'grand format',
    input: {
      dimensions: { widthMm: 3000, heightMm: 2600, depthMm: 600 },
      compartments: [
        { shelves: 5, drawers: 2 },
        { shelves: 5, drawers: 2 },
        { shelves: 5, drawers: 2 },
      ],
    },
  },
  {
    name: 'compartiments inégaux',
    input: {
      dimensions: { widthMm: 2000, heightMm: 1100, depthMm: 400 },
      compartments: [
        { shelves: 0, drawers: 0 },
        { shelves: 4, drawers: 0 },
        { shelves: 0, drawers: 3 },
        { shelves: 2, drawers: 1 },
      ],
    },
  },
];

describe('critère de sortie', () => {
  it('couvre bien vingt formes différentes', () => {
    expect(SHAPES).toHaveLength(20);
    expect(new Set(SHAPES.map((shape) => shape.name)).size).toBe(20);
  });

  it.each(SHAPES.map((shape) => [shape.name, shape.input] as const))(
    '%s : aucune cote n’en chevauche une autre',
    (_name, input) => {
      const drawing = technicalDrawing(build(input), LABEL);

      for (const view of drawing.views) {
        expectNoOverlap(view.dimensions);
        expect(view.dimensions.length).toBeGreaterThan(0);
      }
    },
  );

  it.each(SHAPES.map((shape) => [shape.name, shape.input] as const))(
    '%s : chaque pièce porte ses cotes de découpe',
    (_name, input) => {
      const furniture = build(input);
      const drawing = technicalDrawing(furniture, LABEL);

      for (const part of furniture.parts) {
        const line = drawing.parts.find((candidate) => candidate.partId === part.id);

        // Une élévation dit où va une étagère ; elle ne dit pas à quelle cote la scier.
        expect(line).toBeDefined();
        expect(line?.lengthMm).toBe(part.lengthMm);
        expect(line?.widthMm).toBe(part.widthMm);
        expect(line?.thicknessMm).toBe(part.thicknessMm);
        expect(line?.quantity).toBe(part.quantity);
      }
    },
  );

  it.each(SHAPES.map((shape) => [shape.name, shape.input] as const))(
    '%s : chaque pièce apparaît sur au moins une vue',
    (_name, input) => {
      const furniture = build(input);
      const drawn = new Set(
        VIEWS.flatMap((view) =>
          project(furniture, view).rects.map((rect) => rect.partId),
        ),
      );

      for (const part of furniture.parts) expect(drawn.has(part.id)).toBe(true);
    },
  );
});

describe('chaînes de cotes', () => {
  const furniture = build(SHAPES[0]!.input);
  const drawing = technicalDrawing(furniture, LABEL);
  const front = drawing.views.find((view) => view.view === 'front')!;

  it('donne le hors-tout sur chaque axe', () => {
    const overall = front.dimensions.filter(
      (dimension) => dimension.kind === 'overall',
    );

    expect(overall.map((dimension) => dimension.valueMm).sort((a, b) => a - b)).toEqual(
      [600, 1800],
    );
  });

  it('la chaîne horizontale recompose le hors-tout, sans trou ni recouvrement', () => {
    // C'est ce qu'un menuisier contrôle d'abord : la somme de la chaîne doit faire la
    // largeur. Une chaîne qui ne recompose pas est une chaîne fausse.
    expectRecomposes(front.dimensions, 'horizontal', 1800);
  });

  it('la chaîne verticale recompose la hauteur', () => {
    expectRecomposes(front.dimensions, 'vertical', 600);
  });

  it('cote les compartiments, pas seulement le hors-tout', () => {
    const chain = front.dimensions.filter(
      (dimension) => dimension.axis === 'horizontal' && dimension.kind === 'chain',
    );

    // 18 | 873 | 18 | 873 | 18 : deux côtés, une séparation, deux compartiments.
    expect(chain.map((dimension) => dimension.valueMm)).toEqual([18, 873, 18, 873, 18]);
  });

  it('ne répète pas le hors-tout sous forme de chaîne d’un seul segment', () => {
    // Un meuble sans étagère n'a que le dessous et le dessus : une chaîne verticale de
    // trois segments a du sens, une chaîne d'un seul n'apprendrait rien.
    const bare = technicalDrawing(build(SHAPES[2]!.input), LABEL);
    const side = bare.views.find((view) => view.view === 'left')!;
    const chain = side.dimensions.filter((dimension) => dimension.kind === 'chain');

    for (const dimension of chain) {
      expect(dimension.valueMm).toBeLessThan(900);
    }
  });
});

describe('projection', () => {
  const furniture = build(SHAPES[0]!.input);

  it('retourne la vue arrière — sinon un perçage part du mauvais côté', () => {
    const front = project(furniture, 'front');
    const back = project(furniture, 'back');

    const leftSideFront = front.rects.find((rect) => rect.role === 'side');
    const leftSideBack = back.rects.find((rect) => rect.role === 'side');

    expect(leftSideFront?.xMm).toBe(0);
    // Le même côté se retrouve à droite du dessin, à l'épaisseur près.
    expect(leftSideBack?.xMm).toBe(1800 - (leftSideFront?.widthMm ?? 0));
  });

  it('donne à chaque vue les dimensions du meuble sur ses deux axes', () => {
    expect(project(furniture, 'front')).toMatchObject({ widthMm: 1800, heightMm: 600 });
    expect(project(furniture, 'top')).toMatchObject({ widthMm: 1800, heightMm: 400 });
    expect(project(furniture, 'left')).toMatchObject({ widthMm: 400, heightMm: 600 });
  });

  it('ne laisse aucune pièce sortir de la vue', () => {
    for (const view of VIEWS) {
      const projection = project(furniture, view);

      for (const rect of projection.rects) {
        expect(rect.xMm).toBeGreaterThanOrEqual(0);
        expect(rect.yMm).toBeGreaterThanOrEqual(0);
        expect(rect.xMm + rect.widthMm).toBeLessThanOrEqual(projection.widthMm);
        expect(rect.yMm + rect.heightMm).toBeLessThanOrEqual(projection.heightMm);
      }
    }
  });
});

describe('rendu SVG', () => {
  const drawing = technicalDrawing(build(SHAPES[0]!.input), LABEL);
  const svg = technicalViewSvg(drawing.views[0]!);

  it('agrandit le cadre de la place que prennent les cotes', () => {
    const viewBox = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);

    expect(viewBox).not.toBeNull();
    // L'origine part dans les négatifs : les cotes verticales sont à gauche du dessin.
    expect(Number(viewBox?.[1])).toBeLessThan(0);
    expect(Number(viewBox?.[3])).toBeGreaterThan(1800);
  });

  it('dessine une ligne de cote par cote', () => {
    const labels = [...svg.matchAll(/<text /g)].length;

    expect(labels).toBe(drawing.views[0]!.dimensions.length);
  });

  it('échappe ce qui casserait le XML', () => {
    const hostile = technicalDrawing(build(SHAPES[1]!.input), {
      label: () => '<i>4"</i>',
    });

    expect(technicalViewSvg(hostile.views[0]!)).not.toContain('<i>');
  });
});

/**
 * Deux cotes se chevauchent si elles partagent axe, côté et niveau, et que leurs emprises
 * se recouvrent. L'emprise tient compte de l'étiquette : c'est elle qui déborde.
 */
function expectNoOverlap(dimensions: Dimension[]): void {
  for (let i = 0; i < dimensions.length; i += 1) {
    for (let j = i + 1; j < dimensions.length; j += 1) {
      const a = dimensions[i]!;
      const b = dimensions[j]!;

      if (a.axis !== b.axis || a.side !== b.side || a.level !== b.level) continue;

      const first = boxOf(a);
      const second = boxOf(b);

      expect(
        first.toMm <= second.fromMm || first.fromMm >= second.toMm,
        `${a.label} et ${b.label} se chevauchent au niveau ${a.level}`,
      ).toBe(true);
    }
  }
}

/**
 * L'emprise d'une cote, recalculée indépendamment de la production : son intervalle, son
 * étiquette centrée, et la marge. Une cote de 3 mm porte un texte de cinquante millimètres.
 */
function boxOf(dimension: Dimension): { fromMm: number; toMm: number } {
  const centreMm = (dimension.fromMm + dimension.toMm) / 2;
  const spanMm = dimension.toMm - dimension.fromMm;
  const labelMm = dimension.label.length * CHARACTER_WIDTH_MM;
  const halfMm = (Math.max(spanMm, labelMm) + GAP_MM) / 2;

  return { fromMm: centreMm - halfMm, toMm: centreMm + halfMm };
}

function expectRecomposes(
  dimensions: Dimension[],
  axis: 'horizontal' | 'vertical',
  totalMm: number,
): void {
  const chain = dimensions
    .filter((dimension) => dimension.axis === axis && dimension.kind === 'chain')
    .sort((a, b) => a.fromMm - b.fromMm);

  expect(chain.length).toBeGreaterThan(1);
  expect(chain[0]?.fromMm).toBe(0);
  expect(chain.at(-1)?.toMm).toBe(totalMm);

  for (const [index, dimension] of chain.entries()) {
    if (index > 0) expect(dimension.fromMm).toBe(chain[index - 1]?.toMm);
    expect(dimension.valueMm).toBe(dimension.toMm - dimension.fromMm);
  }

  expect(chain.reduce((total, dimension) => total + dimension.valueMm, 0)).toBe(
    totalMm,
  );
}
