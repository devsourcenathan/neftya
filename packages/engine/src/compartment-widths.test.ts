import { describe, it, expect } from 'vitest';
import { build } from './build.js';
import type { FurnitureInput } from './input.js';
import { recomposes } from './millimetres.js';

/**
 * Les largeurs imposées par compartiment.
 *
 * Jusqu'ici la division égale décidait à la place du menuisier : un socle de tiroirs de
 * 400 mm sous une penderie qui prend le reste ne s'exprimait pas. Une largeur imposée est
 * désormais honorée, et **ce qui reste se divise également entre les autres**.
 *
 * L'invariant qui compte n'est pas « le compartiment fait 400 » : c'est que la largeur
 * intérieure **se recompose** malgré les largeurs imposées. Un millimètre perdu ici est un
 * jour de vide dans un meuble monté.
 *
 * @see docs/NEFTYA_ENGINE.md §7.3
 */

const BASE: FurnitureInput = {
  dimensions: { widthMm: 2000, heightMm: 2000, depthMm: 500 },
  compartments: [{ shelves: 1 }, { shelves: 1 }, { shelves: 1 }],
};

/** La largeur intérieure : le meuble moins ses deux côtés et ses séparateurs. */
function innerWidth(input: FurnitureInput): number {
  const thickness = 18;
  const dividers = input.compartments.length - 1;

  return input.dimensions.widthMm - 2 * thickness - dividers * thickness;
}

/**
 * Les largeurs réellement obtenues, lues sur la géométrie.
 *
 * Depuis les instances, et non depuis l'entrée : c'est la seule façon de vérifier que le
 * moteur a fait ce qu'on lui demandait plutôt que de relire ce qu'on lui a donné.
 */
function widthsOf(input: FurnitureInput): number[] {
  const furniture = build(input);
  const spans = new Map<number, { min: number; max: number }>();

  for (const part of furniture.parts) {
    for (const placement of part.instances) {
      if (placement.compartment === undefined) continue;
      // Les façades débordent leur compartiment : elles pavent la face avant et couvrent
      // la moitié des séparateurs voisins. Elles ne mesurent donc pas l'ouverture.
      if (part.role === 'door' || part.role === 'drawer_face') continue;

      const current = spans.get(placement.compartment) ?? {
        min: Infinity,
        max: -Infinity,
      };
      current.min = Math.min(current.min, placement.xMm);
      current.max = Math.max(current.max, placement.xMm + placement.sizeXMm);
      spans.set(placement.compartment, current);
    }
  }

  return [...spans.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, span]) => span.max - span.min);
}

describe('sans largeur imposée', () => {
  it('se comporte exactement comme avant', () => {
    const widths = widthsOf(BASE);

    // Égaux **au reste de division près** : 1928 mm pour trois compartiments ne tombe pas
    // juste, et le reste va au dernier (§7.3). Exiger l'égalité stricte ici serait exiger
    // du moteur qu'il perde deux millimètres.
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(
      BASE.compartments.length,
    );
  });

  it('ne pose aucune largeur dans le modèle', () => {
    for (const compartment of build(BASE).input.compartments) {
      expect(compartment.widthMm).toBeUndefined();
    }
  });
});

describe('une largeur imposée', () => {
  const FIXED: FurnitureInput = {
    ...BASE,
    compartments: [{ shelves: 1, widthMm: 400 }, { shelves: 1 }, { shelves: 1 }],
  };

  it('est honorée au millimètre', () => {
    const furniture = build(FIXED);
    const shelf = furniture.parts
      .flatMap((part) => part.instances.map((placement) => ({ part, placement })))
      .find(
        (entry) => entry.part.role === 'shelf' && entry.placement.compartment === 0,
      );

    // L'étagère fait l'ouverture moins deux fois le jeu de 2 mm.
    expect(shelf?.placement.sizeXMm).toBe(400 - 4);
  });

  it('laisse les souples se partager le reste, à parts égales', () => {
    const widths = widthsOf(FIXED);

    expect(widths[1]).toBe(widths[2]);
  });

  it('ne perd pas un millimètre au passage', () => {
    // **L'invariant de recomposition.** Les trois ouvertures et les deux séparateurs
    // doivent redonner la largeur intérieure, exactement.
    const furniture = build(FIXED);
    const openings = furniture.parts
      .filter((part) => part.role === 'divider')
      .flatMap((part) => part.instances)
      .map((placement) => placement.xMm)
      .sort((a, b) => a - b);

    const thickness = 18;
    const parts = [
      (openings[0] as number) - thickness,
      (openings[1] as number) - (openings[0] as number) - thickness,
      2000 - thickness - ((openings[1] as number) + thickness),
    ];

    expect(recomposes(parts, innerWidth(FIXED))).toBe(true);
    expect(parts[0]).toBe(400);
  });
});

describe('ce que le moteur refuse de rattraper en silence', () => {
  it('signale des largeurs qui dépassent la place', () => {
    const tooWide: FurnitureInput = {
      ...BASE,
      compartments: [
        { shelves: 1, widthMm: 1200 },
        { shelves: 1, widthMm: 1200 },
        { shelves: 1 },
      ],
    };
    const warnings = build(tooWide).warnings.map((warning) => warning.code);

    expect(warnings).toContain('COMPARTMENT_WIDTH_MISMATCH');
  });

  it('ne produit jamais une ouverture négative', () => {
    const tooWide: FurnitureInput = {
      ...BASE,
      compartments: [
        { shelves: 1, widthMm: 1400 },
        { shelves: 1, widthMm: 1400 },
        { shelves: 1 },
      ],
    };

    // Une cote négative dans une liste de découpe est un plan faux. Le moteur signale et
    // borne ; il ne scie pas dans le vide.
    for (const part of build(tooWide).parts) {
      expect(part.lengthMm).toBeGreaterThanOrEqual(0);
      expect(part.widthMm).toBeGreaterThanOrEqual(0);
    }
  });

  it('fait absorber l’écart au dernier quand tout est imposé', () => {
    const all: FurnitureInput = {
      ...BASE,
      compartments: [
        { shelves: 1, widthMm: 500 },
        { shelves: 1, widthMm: 500 },
        { shelves: 1, widthMm: 500 },
      ],
    };
    const furniture = build(all);

    // La largeur du meuble fait foi : c'est elle qu'on a mesurée contre un mur. Un caisson
    // qui ne la respecterait pas laisserait un vide à l'intérieur.
    expect(furniture.warnings.map((warning) => warning.code)).toContain(
      'COMPARTMENT_WIDTH_MISMATCH',
    );
    expect(widthsOf(all)[0]).toBeLessThan(widthsOf(all)[2] as number);
  });
});
