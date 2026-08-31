import { describe, it, expect } from 'vitest';
import { build } from './build.js';
import { nest, type NestedPanel, type NestingResult } from './nesting.js';
import type { FurnitureInput } from './input.js';
import { PANEL_FORMATS_MM } from './materials.js';

/**
 * Le placement, et les deux choses qui doivent rester vraies quoi qu'il arrive : aucune
 * pièce ne sort du panneau, et deux pièces ne se chevauchent jamais — trait de scie compris.
 *
 * C'est là que vivent les plans faux, et un plan faux se paie en panneau perdu.
 */

/** Le meuble du §2 de MANUFACTURING.md : 1800 × 600 × 400, deux compartiments, MDF. */
const REFERENCE: FurnitureInput = {
  dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
  compartments: [
    { shelves: 1, drawers: 0 },
    { shelves: 1, drawers: 0 },
  ],
  material: 'mdf',
  hasBack: true,
};

describe('le meuble de référence produit le plan documenté', () => {
  const furniture = build(REFERENCE);
  const result = nest(furniture);

  const thick = panelsOfThickness(result, 18);
  const thin = panelsOfThickness(result, 8);

  it('tient sur un seul panneau de 18 mm', () => {
    expect(thick).toHaveLength(1);
    expect(thin).toHaveLength(1);
    expect(result.unplaced).toEqual([]);
  });

  it('utilise 93,2 % du panneau', () => {
    // 2 773 620 mm² de pièces sur 2 976 800 mm² de panneau.
    expect(thick[0]?.usedAreaMm2).toBe(2_773_620);
    expect(thick[0]?.areaMm2).toBe(2_976_800);
    expect(round(thick[0]?.utilisation ?? 0)).toBe(93.2);
  });

  it('place les pièces là où le plan les montre', () => {
    const byId = new Map<string, { xMm: number; yMm: number }[]>();
    for (const placement of thick[0]?.placements ?? []) {
      byId.set(placement.partId, [
        ...(byId.get(placement.partId) ?? []),
        { xMm: placement.xMm, yMm: placement.yMm },
      ]);
    }

    // Bande 1 : le dessus et un côté ; bande 2 : le dessous et l'autre côté ; bande 3 :
    // les deux étagères et la séparation. Les abscisses portent le trait de scie de 3 mm.
    expect(byId.get('P01')).toEqual([{ xMm: 0, yMm: 0 }]);
    expect(byId.get('P02')).toEqual([{ xMm: 0, yMm: 403 }]);
    expect(byId.get('P03')).toEqual([
      { xMm: 1803, yMm: 0 },
      { xMm: 1803, yMm: 403 },
    ]);
    expect(byId.get('P05')).toEqual([
      { xMm: 0, yMm: 806 },
      { xMm: 876, yMm: 806 },
    ]);
    expect(byId.get('P04')).toEqual([{ xMm: 1752, yMm: 806 }]);
  });

  it('ne dépasse jamais le panneau, traits de scie compris', () => {
    for (const panel of result.panels) expectInsideAndDisjoint(panel, result.kerfMm);
  });
});

describe('propriétés du placement', () => {
  // Des configurations variées, mais reproductibles : le moteur est déterministe, ses
  // tests doivent l'être aussi.
  const configurations = generate(400);

  it('aucune pièce ne sort du panneau et aucune ne se chevauche', () => {
    for (const configuration of configurations) {
      const result = nest(build(configuration));
      for (const panel of result.panels) expectInsideAndDisjoint(panel, result.kerfMm);
    }
  });

  it('toute pièce du meuble est placée, en la bonne quantité', () => {
    for (const configuration of configurations) {
      const furniture = build(configuration);
      const result = nest(furniture);

      const placed = new Map<string, number>();
      for (const panel of result.panels) {
        for (const placement of panel.placements) {
          placed.set(placement.partId, (placed.get(placement.partId) ?? 0) + 1);
        }
      }

      for (const part of furniture.parts) {
        // Placée, ou explicitement signalée comme impossible à placer : jamais perdue en
        // silence. Une pièce oubliée produirait un plan qui a l'air complet.
        const signalled = result.unplaced.filter((id) => id === part.id).length;
        expect((placed.get(part.id) ?? 0) + signalled).toBe(part.quantity);
      }
    }
  });

  it('ne mélange jamais deux épaisseurs sur un panneau', () => {
    for (const configuration of configurations) {
      const furniture = build(configuration);
      const result = nest(furniture);
      const thicknessOf = new Map(
        furniture.parts.map((part) => [part.id, part.thicknessMm]),
      );

      for (const panel of result.panels) {
        for (const placement of panel.placements) {
          expect(thicknessOf.get(placement.partId)).toBe(panel.thicknessMm);
        }
      }
    }
  });

  it('la surface posée ne dépasse jamais celle du panneau', () => {
    for (const configuration of configurations) {
      const result = nest(build(configuration));
      for (const panel of result.panels) {
        expect(panel.usedAreaMm2).toBeLessThanOrEqual(panel.areaMm2);
        expect(panel.utilisation).toBeGreaterThan(0);
        expect(panel.utilisation).toBeLessThanOrEqual(1);
      }
    }
  });

  it('est déterministe', () => {
    for (const configuration of configurations.slice(0, 40)) {
      const furniture = build(configuration);
      expect(nest(furniture)).toEqual(nest(furniture));
    }
  });
});

describe('formats', () => {
  it('signale les pièces qu’aucun format ne peut recevoir, au lieu de les perdre', () => {
    const furniture = build(REFERENCE);
    // Un format volontairement trop petit : le dessus de 1800 mm n'y entre pas, les
    // étagères de 873 si.
    const result = nest(furniture, { formats: [{ lengthMm: 1000, widthMm: 600 }] });

    expect(result.unplaced).toContain('P01');
    expect(result.unplaced).toContain('P02');
    // Une pièce trop grande ne condamne pas les autres.
    expect(
      result.panels.flatMap((panel) => panel.placements).map((p) => p.partId),
    ).toContain('P05');
  });

  it('tronque un format impérial à l’entier inférieur', () => {
    // 4' × 8' vaut 2438,4 × 1219,2 mm. Arrondir au supérieur ferait croire à un
    // millimètre de panneau qui n'existe pas.
    const result = nest(build(REFERENCE), { formats: PANEL_FORMATS_MM.imperial });
    const panel = result.panels[0];

    expect(panel?.format.lengthMm).toBe(2438);
    expect(panel?.format.widthMm).toBe(1219);
    expect(Number.isInteger(panel?.format.lengthMm)).toBe(true);
  });

  it('un trait de scie plus large consomme davantage de panneau', () => {
    const furniture = build(REFERENCE);

    const fine = nest(furniture, { kerfMm: 1 });
    const coarse = nest(furniture, { kerfMm: 40 });

    // Les pièces ne changent pas de taille : c'est le nombre de panneaux qui bouge.
    expect(fine.panels.length).toBeLessThanOrEqual(coarse.panels.length);
  });
});

function panelsOfThickness(result: NestingResult, thicknessMm: number): NestedPanel[] {
  return result.panels.filter((panel) => panel.thicknessMm === thicknessMm);
}

function round(utilisation: number): number {
  return Math.round(utilisation * 1000) / 10;
}

/**
 * Les deux invariants, vérifiés ensemble : dans le panneau, et sans chevauchement.
 *
 * Le trait de scie sépare deux pièces voisines ; deux pièces qui se toucheraient
 * exactement seraient impossibles à couper.
 */
function expectInsideAndDisjoint(panel: NestedPanel, kerfMm: number): void {
  for (const placement of panel.placements) {
    expect(placement.xMm).toBeGreaterThanOrEqual(0);
    expect(placement.yMm).toBeGreaterThanOrEqual(0);
    expect(placement.xMm + placement.sizeXMm).toBeLessThanOrEqual(
      panel.format.lengthMm,
    );
    expect(placement.yMm + placement.sizeYMm).toBeLessThanOrEqual(panel.format.widthMm);
  }

  for (let i = 0; i < panel.placements.length; i += 1) {
    for (let j = i + 1; j < panel.placements.length; j += 1) {
      const a = panel.placements[i];
      const b = panel.placements[j];
      if (!a || !b) continue;

      // Séparées d'au moins un trait de scie sur l'un des deux axes.
      const separatedX =
        a.xMm + a.sizeXMm + kerfMm <= b.xMm || b.xMm + b.sizeXMm + kerfMm <= a.xMm;
      const separatedY =
        a.yMm + a.sizeYMm + kerfMm <= b.yMm || b.yMm + b.sizeYMm + kerfMm <= a.yMm;

      expect(separatedX || separatedY).toBe(true);
    }
  }
}

/** Générateur reproductible — même graine, mêmes configurations. */
function generate(count: number) {
  let seed = 20260831;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const between = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));

  return Array.from({ length: count }, (): FurnitureInput => ({
    dimensions: {
      widthMm: between(400, 3000),
      heightMm: between(400, 2400),
      depthMm: between(200, 700),
    },
    compartments: Array.from({ length: between(1, 5) }, () => ({
      shelves: between(0, 4),
      drawers: between(0, 2),
    })),
    material: (['mdf', 'melamine', 'plywood', 'solid_wood'] as const)[between(0, 3)],
    hasBack: next() > 0.2,
  }));
}
