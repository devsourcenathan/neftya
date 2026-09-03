import { describe, it, expect } from 'vitest';
import { build, drilling, type FurnitureInput } from '@neftya/engine';
import { drillPlanDxf, LAYERS, PLAIN_LABELS } from './drill-plan.js';

/**
 * Le plan de perçage DXF.
 *
 * Le fichier est **relu** ici, jamais comparé à une chaîne attendue. Un test qui vérifie
 * qu'un export contient `CIRCLE` ne dit rien de la position du trou, et c'est la position
 * qui fait qu'une porte ferme.
 *
 * @see docs/MANUFACTURING.md §7
 */

const WARDROBE: FurnitureInput = {
  dimensions: { widthMm: 1000, heightMm: 2000, depthMm: 600 },
  compartments: [
    {
      shelves: 2,
      drawers: 1,
      doors: 2,
      pulls: [
        { target: 'door', slot: 0, key: 'pull_bar_128' },
        { target: 'door', slot: 1, key: 'pull_knob' },
        { target: 'drawer', slot: 0, key: 'pull_shell' },
      ],
    },
  ],
};

const BOOKCASE: FurnitureInput = {
  dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
  compartments: [
    { shelves: 1, drawers: 0, doors: 0 },
    { shelves: 1, drawers: 0, doors: 0 },
  ],
};

const planOf = (input: FurnitureInput) => {
  const furniture = build(input);
  return drillPlanDxf(furniture, drilling(furniture), PLAIN_LABELS);
};

/* ---------------------------------------------------------------- un lecteur */

interface Entity {
  kind: string;
  layer: string;
  values: Map<number, string[]>;
}

/**
 * Un lecteur de DXF R12, écrit pour ce test.
 *
 * Le format est une suite de couples : un code sur une ligne, sa valeur sur la suivante.
 * Le code 0 ouvre une entité, le 8 nomme son calque.
 */
function parse(dxf: string): {
  entities: Entity[];
  layers: string[];
  header: Map<string, string>;
} {
  const lines = dxf.split('\r\n').slice(0, -1);
  expect(lines.length % 2).toBe(0);

  const pairs: [number, string][] = [];
  for (let index = 0; index < lines.length; index += 2) {
    const code = Number(lines[index]);

    expect(Number.isInteger(code)).toBe(true);
    pairs.push([code, lines[index + 1] as string]);
  }

  const entities: Entity[] = [];
  const layers: string[] = [];
  const header = new Map<string, string>();

  let section = '';
  let current: Entity | null = null;
  let headerKey: string | null = null;

  for (const [code, value] of pairs) {
    if (code === 9) {
      headerKey = value;
      continue;
    }
    if (headerKey && code === 70) {
      header.set(headerKey, value);
      headerKey = null;
      continue;
    }

    if (
      code === 2 &&
      (value === 'HEADER' || value === 'TABLES' || value === 'ENTITIES')
    ) {
      section = value;
      continue;
    }

    if (code === 0) {
      current = null;
      if (section === 'ENTITIES' && !['SECTION', 'ENDSEC', 'EOF'].includes(value)) {
        current = { kind: value, layer: '', values: new Map() };
        entities.push(current);
      }
      if (section === 'TABLES' && value === 'LAYER') current = null;
      continue;
    }

    if (section === 'TABLES' && code === 2 && value !== 'LAYER') layers.push(value);

    if (!current) continue;
    if (code === 8) current.layer = value;
    current.values.set(code, [...(current.values.get(code) ?? []), value]);
  }

  return { entities, layers, header };
}

const at = (entity: Entity, code: number) => Number(entity.values.get(code)?.[0]);

/**
 * Les contours, reconstitués depuis leurs traits.
 *
 * Un contour est écrit d'un bloc, quatre traits à la suite : les découper par quatre dans
 * l'ordre du fichier suffit, et vaut mieux qu'un assemblage par proximité qui fusionnerait
 * deux pièces voisines.
 */
function contours(
  entities: Entity[],
): { x0: number; y0: number; x1: number; y1: number }[] {
  const lines = entities.filter((entity) => entity.layer === LAYERS.contour);
  expect(lines.length % 4).toBe(0);

  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];

  for (let index = 0; index < lines.length; index += 4) {
    const four = lines.slice(index, index + 4);
    const xs = four.flatMap((entity) => [at(entity, 10), at(entity, 11)]);
    const ys = four.flatMap((entity) => [at(entity, 20), at(entity, 21)]);

    boxes.push({
      x0: Math.min(...xs),
      y0: Math.min(...ys),
      x1: Math.max(...xs),
      y1: Math.max(...ys),
    });
  }

  return boxes;
}

/* ------------------------------------------------------------------- le fond */

describe('le fichier', () => {
  it('se relit comme des couples code / valeur', () => {
    // Une ligne de trop et tout le fichier est décalé d'un cran : les lecteurs les plus
    // anciens ne s'en plaignent pas, ils lisent des coordonnées absurdes.
    expect(() => parse(planOf(WARDROBE))).not.toThrow();
  });

  it('déclare les millimètres', () => {
    // Sans `$INSUNITS`, un lecteur suppose souvent le pouce, et le premier trou part à
    // 940 mm du bord sans que rien ne le signale.
    expect(parse(planOf(WARDROBE)).header.get('$INSUNITS')).toBe('4');
  });

  it('n’écrit jamais un nombre en notation exponentielle', () => {
    // `1e-7` est un nombre valide en JavaScript et une erreur de syntaxe dans un DXF.
    expect(planOf(WARDROBE)).not.toMatch(/e[+-]?\d/iu);
  });

  it('reste en ASCII', () => {
    // R12 ne dit pas quel encodage il utilise : un accent y devient ce que le lecteur veut
    // bien en faire.
    expect(planOf(WARDROBE)).toMatch(/^[\x20-\x7e\r\n]*$/u);
  });

  it('rend le même fichier pour le même meuble', () => {
    // Deux exports du même projet doivent donner le même fichier, octet pour octet, sinon
    // l'instantané figé n'a plus de sens.
    expect(planOf(WARDROBE)).toBe(planOf(WARDROBE));
  });

  it('déclare exactement les calques qu’il emploie', () => {
    const { entities, layers } = parse(planOf(WARDROBE));
    const used = new Set(entities.map((entity) => entity.layer));

    // Une entité sur un calque non déclaré est ignorée en silence par certains lecteurs :
    // le contour s'affiche, les perçages non.
    for (const layer of used) expect(layers).toContain(layer);
    expect(new Set(layers)).toEqual(new Set(Object.values(LAYERS)));
  });
});

describe('les trous', () => {
  it('sont tous là, et une seule fois', () => {
    const furniture = build(WARDROBE);
    const holes = drilling(furniture).parts.flatMap((part) => part.holes);
    const { entities } = parse(
      drillPlanDxf(furniture, drilling(furniture), PLAIN_LABELS),
    );

    const drilled: string[] = [LAYERS.face, LAYERS.back, LAYERS.edge, LAYERS.through];
    const drawn = entities.filter((entity) => drilled.includes(entity.layer));

    // Un plan de perçage amputé d'un trou est un plan faux qui a l'air complet.
    expect(drawn).toHaveLength(holes.length);
  });

  it('tiennent dans le contour de leur pièce', () => {
    for (const input of [WARDROBE, BOOKCASE]) {
      const { entities } = parse(planOf(input));
      const boxes = contours(entities);

      expect(boxes.length).toBeGreaterThan(0);

      for (const entity of entities) {
        if (entity.kind !== 'CIRCLE') continue;

        const [x, y, r] = [at(entity, 10), at(entity, 20), at(entity, 40)];
        // Un cercle qui déborde son contour est un repère faux : le trou est ailleurs que
        // là où le fichier le montre.
        const inside = boxes.some(
          (box) =>
            x - r >= box.x0 - 0.001 &&
            x + r <= box.x1 + 0.001 &&
            y - r >= box.y0 - 0.001 &&
            y + r <= box.y1 + 0.001,
        );

        expect(inside).toBe(true);
      }
    }
  });

  it('sépare la face et le dos par le calque', () => {
    const { entities } = parse(planOf(WARDROBE));
    const layers = new Set(entities.map((entity) => entity.layer));

    // Le repère d'un trou est celui de la face qu'on perce. Mélanger les deux sur un seul
    // calque obligerait l'atelier à deviner de quel côté retourner la pièce, et un
    // fraisage de charnière fait à l'envers traverse la porte.
    expect(layers).toContain(LAYERS.face);
    expect(layers).toContain(LAYERS.back);
  });

  it('marque un perçage de chant par un trait, jamais par un cercle', () => {
    const { entities } = parse(planOf(BOOKCASE));
    const edges = entities.filter((entity) => entity.layer === LAYERS.edge);

    expect(edges.length).toBeGreaterThan(0);
    // Le trou n'est pas dans la face qu'on regarde : il entre par la tranche.
    for (const entity of edges) expect(entity.kind).toBe('LINE');
  });
});

describe('la mise en planche', () => {
  it('donne deux blocs à une pièce percée des deux côtés', () => {
    // Le séparateur d'une bibliothèque porte une étagère de chaque côté : il se perce donc
    // sur ses deux faces, et chacune a son propre repère.
    const furniture = build(BOOKCASE);
    const holes = drilling(furniture);

    const twoFaced = holes.parts.filter(
      (part) =>
        part.holes.some((hole) => hole.side === 'front') &&
        part.holes.some((hole) => hole.side === 'back'),
    );
    expect(twoFaced.length).toBeGreaterThan(0);

    const { entities } = parse(drillPlanDxf(furniture, holes, PLAIN_LABELS));
    const titles = entities
      .filter((entity) => entity.kind === 'TEXT')
      .map((entity) => entity.values.get(1)?.[0] ?? '');

    for (const part of twoFaced) {
      const prefix = `${part.partId} #${part.instanceIndex + 1}`;

      expect(titles).toContain(`${prefix} - face`);
      expect(titles).toContain(`${prefix} - dos`);
    }
  });

  it('ne superpose pas deux contours', () => {
    const boxes = contours(parse(planOf(WARDROBE)).entities);

    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i] as (typeof boxes)[number];
        const b = boxes[j] as (typeof boxes)[number];
        const apart = a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;

        // Deux pièces dessinées l'une sur l'autre donnent un fichier illisible et des
        // cotes qu'on attribue à la mauvaise pièce.
        expect(apart).toBe(true);
      }
    }
  });

  it('nomme chaque bloc par son repère et son rang d’instance', () => {
    const { entities } = parse(planOf(WARDROBE));
    const titles = entities
      .filter((entity) => entity.layer === LAYERS.label)
      .map((entity) => entity.values.get(1)?.[0] ?? '');

    // Les deux vantaux d'une paire sont la même pièce et ne se percent pas pareil : sans
    // le rang, l'atelier ne saurait pas lequel est lequel.
    expect(titles.some((title) => /^P\d+ #2 - /u.test(title))).toBe(true);
  });
});

describe('poignées', () => {
  it('met les traversants sur leur propre calque', () => {
    const { entities } = parse(planOf(WARDROBE));
    const through = entities.filter((entity) => entity.layer === LAYERS.through);

    // L'atelier ne monte pas la même mèche et ne règle pas la même butée : un traversant
    // fait sur un réglage borgne ne tient rien. Et un cercle ne dit pas s'il débouche.
    expect(through.length).toBeGreaterThan(0);
    for (const entity of through) expect(entity.kind).toBe('CIRCLE');
  });

  it('dessine l’empreinte d’une coquille en rectangle, pas en cercle', () => {
    const { entities } = parse(planOf(WARDROBE));
    const milled = entities.filter((entity) => entity.layer === LAYERS.milling);

    // Une poche fraisée représentée par un perçage ferait fraiser un rond là où il faut un
    // rectangle, et l'atelier s'en apercevrait au premier panneau.
    expect(milled).toHaveLength(4);
    for (const entity of milled) expect(entity.kind).toBe('LINE');
  });

  it('donne un bloc à une façade qui n’a qu’une empreinte', () => {
    // Sans cela, la façade à coquille n'apparaîtrait pas du tout : elle n'a aucun trou, et
    // le bloc n'était créé que pour des trous.
    const { entities } = parse(planOf(WARDROBE));
    const titles = entities
      .filter((entity) => entity.layer === LAYERS.label)
      .map((entity) => entity.values.get(1)?.[0] ?? '');

    expect(titles.some((title) => title.startsWith('fraisage'))).toBe(true);
  });
});
