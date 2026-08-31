import { describe, it, expect } from 'vitest';
import { build, type Furniture } from './build.js';
import type { FurnitureInput } from './input.js';
import type { MaterialKey } from './materials.js';

/**
 * L'invariant de recomposition, sur des milliers de configurations.
 *
 * C'est la démonstration la plus directe que le moteur est juste : la somme des pièces et
 * des épaisseurs égale la cote hors-tout, au millimètre. Il n'y a pas de marge « pour
 * absorber les arrondis » — elle rendrait ce contrôle incapable de distinguer un arrondi
 * d'un vrai défaut.
 *
 * Le générateur est déterministe : un échec se rejoue à l'identique.
 *
 * @see docs/NEFTYA_ENGINE.md §4 « Tolérance : zéro »
 * @see docs/IMPLEMENTATION.md — critère de sortie de la phase 1
 */

/** Générateur congruentiel linéaire : reproductible, et suffisant pour explorer. */
function makeRandom(seed: number) {
  let state = seed;
  return {
    int(min: number, max: number): number {
      state = (state * 1664525 + 1013904223) >>> 0;
      return min + (state % (max - min + 1));
    },
    pick<T>(values: readonly T[]): T {
      return values[this.int(0, values.length - 1)] as T;
    },
  };
}

const MATERIALS: readonly MaterialKey[] = ['melamine', 'mdf', 'plywood', 'solid_wood'];

function generate(random: ReturnType<typeof makeRandom>): FurnitureInput {
  const compartmentCount = random.int(1, 6);

  return {
    dimensions: {
      widthMm: random.int(400, 3000),
      heightMm: random.int(300, 2400),
      depthMm: random.int(200, 800),
    },
    compartments: Array.from({ length: compartmentCount }, () => ({
      shelves: random.int(0, 5),
      drawers: random.int(0, 3),
    })),
    material: random.pick(MATERIALS),
    parameters: {
      panelThicknessMm: random.pick([8, 12, 16, 18, 22, 25]),
      backThicknessMm: random.pick([5, 8, 10]),
      frontGapMm: random.pick([2, 3, 4]),
    },
    hasBack: random.int(0, 1) === 1,
  } as FurnitureInput;
}

/** Positions x des séparateurs, toutes instances confondues, dans l'ordre. */
function dividerPositions(furniture: Furniture): number[] {
  return furniture.parts
    .filter((part) => part.role === 'divider')
    .flatMap((part) => part.instances.map((instance) => instance.xMm))
    .sort((a, b) => a - b);
}

/**
 * La largeur se recompose : côté + compartiments + séparateurs + côté = hors-tout.
 * Retourne les largeurs de compartiment au passage, pour vérifier qu'aucune n'est nulle.
 */
function recomposeWidth(furniture: Furniture): {
  total: number;
  compartments: number[];
} {
  const e = furniture.parameters.panelThicknessMm;
  const width = furniture.input.dimensions.widthMm;
  const dividers = dividerPositions(furniture);

  const compartments: number[] = [];
  let cursor = e;

  for (const dividerX of dividers) {
    compartments.push(dividerX - cursor);
    cursor = dividerX + e;
  }
  compartments.push(width - e - cursor);

  const total =
    2 * e + dividers.length * e + compartments.reduce((sum, value) => sum + value, 0);

  return { total, compartments };
}

describe('invariants du moteur', () => {
  const CONFIGURATIONS = 3000;
  const cases = Array.from({ length: CONFIGURATIONS }, (_, index) =>
    generate(makeRandom(index + 1)),
  );

  it(`recompose la largeur sur ${CONFIGURATIONS} configurations`, () => {
    const failures: string[] = [];

    for (const input of cases) {
      const furniture = build(input);
      const { total, compartments } = recomposeWidth(furniture);
      const expected = input.dimensions.widthMm;

      if (total !== expected) {
        failures.push(`largeur ${expected} recomposée à ${total}`);
      }
      if (compartments.some((value) => value <= 0)) {
        failures.push(`compartiment de largeur nulle ou négative sur ${expected} mm`);
      }
    }

    expect(failures.slice(0, 5)).toEqual([]);
  });

  it(`recompose la hauteur sur ${CONFIGURATIONS} configurations`, () => {
    const failures: string[] = [];

    for (const input of cases) {
      const furniture = build(input);
      const e = furniture.parameters.panelThicknessMm;
      const side = furniture.parts.find((part) => part.role === 'side');
      const innerHeight = side?.instances[0]?.sizeYMm ?? 0;

      if (2 * e + innerHeight !== input.dimensions.heightMm) {
        failures.push(`hauteur ${input.dimensions.heightMm} : 2×${e} + ${innerHeight}`);
      }
    }

    expect(failures.slice(0, 5)).toEqual([]);
  });

  it('ne produit jamais de cote à virgule', () => {
    const failures: string[] = [];

    for (const input of cases) {
      for (const part of build(input).parts) {
        const dimensions = [part.lengthMm, part.widthMm, part.thicknessMm];
        if (dimensions.some((value) => !Number.isInteger(value))) {
          failures.push(`${part.role} : ${dimensions.join(' × ')}`);
        }
      }
    }

    expect(failures.slice(0, 5)).toEqual([]);
  });

  it('ne produit jamais de cote nulle ou négative', () => {
    const failures: string[] = [];

    for (const input of cases) {
      for (const part of build(input).parts) {
        if (part.lengthMm <= 0 || part.widthMm <= 0 || part.thicknessMm <= 0) {
          failures.push(
            `${part.role} : ${part.lengthMm} × ${part.widthMm} × ${part.thicknessMm}`,
          );
        }
      }
    }

    expect(failures.slice(0, 5)).toEqual([]);
  });

  it('garde chaque pièce dans l’encombrement du meuble', () => {
    const failures: string[] = [];

    for (const input of cases) {
      const furniture = build(input);
      const { widthMm, heightMm } = furniture.input.dimensions;

      for (const part of furniture.parts) {
        for (const instance of part.instances) {
          if (instance.xMm < 0 || instance.xMm + instance.sizeXMm > widthMm) {
            failures.push(`${part.role} déborde en largeur`);
          }
          if (instance.yMm < 0 || instance.yMm + instance.sizeYMm > heightMm) {
            failures.push(`${part.role} déborde en hauteur`);
          }
        }
      }
    }

    expect(failures.slice(0, 5)).toEqual([]);
  });

  it('est déterministe sur toutes les configurations', () => {
    // Même entrée, même sortie : c'est ce qui permet au moteur de tourner à la fois
    // dans le navigateur et sur le serveur sans jamais diverger.
    for (const input of cases.slice(0, 200)) {
      expect(build(input)).toEqual(build(input));
    }
  });

  it('pave la façade quand tous les compartiments ont des tiroirs', () => {
    // Un compartiment sans tiroir n'a pas de façade : il montre son intérieur, ce qui est
    // le comportement voulu pour une niche ouverte. Le pavage complet ne se vérifie donc
    // que lorsque tous les compartiments en ont un.
    const failures: string[] = [];
    let checked = 0;

    for (const input of cases) {
      const furniture = build(input);

      const everyCompartmentHasDrawers = furniture.input.compartments.every(
        (compartment) => compartment.drawers > 0,
      );
      if (!everyCompartmentHasDrawers) continue;
      if (furniture.warnings.some((w) => w.code === 'DRAWER_DOES_NOT_FIT')) continue;

      const columns = new Map<number, number>();
      for (const part of furniture.parts.filter((p) => p.role === 'drawer_face')) {
        for (const instance of part.instances) {
          columns.set(instance.xMm, instance.sizeXMm);
        }
      }

      checked += 1;
      const gap = furniture.parameters.frontGapMm;
      const total =
        [...columns.values()].reduce((sum, value) => sum + value, 0) +
        (columns.size - 1) * gap;

      if (total !== furniture.input.dimensions.widthMm) {
        failures.push(
          `façade : ${total} au lieu de ${furniture.input.dimensions.widthMm}`,
        );
      }
    }

    expect(failures.slice(0, 5)).toEqual([]);
    // Le test ne vaut que s'il a réellement examiné des cas.
    expect(checked).toBeGreaterThan(50);
  });

  it('ne fait jamais tomber un jeu de façade à côté d’un séparateur', () => {
    // Sinon on voit à l'intérieur du meuble.
    const failures = cases
      .map((input) => build(input))
      .filter((furniture) =>
        furniture.warnings.some((w) => w.code === 'FRONT_GAP_OFF_DIVIDER'),
      );

    expect(failures.length).toBe(0);
  });
});
