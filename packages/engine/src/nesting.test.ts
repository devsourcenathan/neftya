import { describe, it, expect } from 'vitest';
import { build } from './build.js';
import { nest, type NestedPanel, type NestingResult } from './nesting.js';
import { nestingViolations, panelViolations } from './nesting-properties.js';
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

  it('utilise 93,1 % du panneau acheté', () => {
    // 2 770 564 mm² de pièces sur 2 976 800 mm² de panneau.
    //
    // Rapporté au panneau **acheté**, pas à la surface délignée : la perte du délignage
    // est réelle, et la rapporter à la surface utile ferait paraître le plan meilleur
    // qu'il n'est.
    expect(thick[0]?.usedAreaMm2).toBe(2_770_564);
    expect(thick[0]?.areaMm2).toBe(2_976_800);
    expect(round(thick[0]?.utilisation ?? 0)).toBe(93.1);
  });

  it('déligne dix millimètres sur chaque rive', () => {
    const panel = thick[0];

    expect(panel?.trimMm).toBe(10);
    expect(panel?.usableFormat).toEqual({ lengthMm: 2420, widthMm: 1200 });

    // Rien n'est posé dans la bande délignée : un panneau livré arrive avec des rives
    // abîmées, et la dernière coupe est celle qui manquerait.
    for (const placement of panel?.placements ?? []) {
      expect(placement.xMm).toBeGreaterThanOrEqual(10);
      expect(placement.yMm).toBeGreaterThanOrEqual(10);
      expect(placement.xMm + placement.sizeXMm).toBeLessThanOrEqual(2430);
      expect(placement.yMm + placement.sizeYMm).toBeLessThanOrEqual(1210);
    }
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
    // les deux étagères et la séparation. Les abscisses portent le trait de scie de 3 mm,
    // et tout est décalé des 10 mm de délignage : les positions sont données dans le
    // repère du panneau acheté, celui où l'opérateur pose son mètre.
    expect(byId.get('P01')).toEqual([{ xMm: 10, yMm: 10 }]);
    expect(byId.get('P02')).toEqual([{ xMm: 10, yMm: 413 }]);
    expect(byId.get('P03')).toEqual([
      { xMm: 1813, yMm: 10 },
      { xMm: 1813, yMm: 413 },
    ]);
    expect(byId.get('P05')).toEqual([
      { xMm: 10, yMm: 816 },
      { xMm: 882, yMm: 816 },
    ]);
    expect(byId.get('P04')).toEqual([{ xMm: 1754, yMm: 816 }]);
  });

  it('ne dépasse jamais le panneau, traits de scie compris', () => {
    for (const panel of result.panels) expectInsideAndDisjoint(panel, result.kerfMm);
  });
});

describe('propriétés du placement', () => {
  // Des configurations variées, mais reproductibles : le moteur est déterministe, ses
  // tests doivent l'être aussi.
  //
  // Le placement est calculé **une fois** et partagé par les propriétés. Le refaire dans
  // chaque test multipliait le travail par cinq, pour un test qui dépassait le délai de
  // vitest dès que la machine était chargée — un test instable finit ignoré.
  const cases = generate(400).map((input) => {
    const furniture = build(input);
    return { furniture, result: nest(furniture) };
  });

  it('aucune pièce ne sort du panneau et aucune ne se chevauche', () => {
    const violations = cases.flatMap(({ result }) =>
      result.panels.flatMap((panel) => panelViolations(panel, result.kerfMm)),
    );

    expect(violations).toEqual([]);
  });

  it('toute pièce est placée ou signalée, et jamais sur la mauvaise épaisseur', () => {
    // Placée, ou explicitement signalée comme impossible à placer : jamais perdue en
    // silence. Une pièce oubliée produirait un plan qui a l'air complet.
    const violations = cases.flatMap(({ furniture, result }) =>
      nestingViolations(furniture, result),
    );

    expect(violations).toEqual([]);
  });

  it('la surface posée ne dépasse jamais celle du panneau', () => {
    const outOfRange = cases
      .flatMap(({ result }) => result.panels)
      .filter(
        (panel) =>
          panel.usedAreaMm2 > panel.areaMm2 ||
          panel.utilisation <= 0 ||
          panel.utilisation > 1,
      );

    expect(outOfRange).toEqual([]);
  });

  it('est déterministe', () => {
    for (const { furniture, result } of cases.slice(0, 40)) {
      expect(nest(furniture)).toEqual(result);
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
 * Les deux invariants du meuble de référence : dans le panneau, et sans chevauchement.
 *
 * Le contrôle lui-même vit dans `nesting-properties.ts`, à côté du placement : il sert
 * aussi à vérifier un plan avant de l'envoyer à l'atelier.
 */
function expectInsideAndDisjoint(panel: NestedPanel, kerfMm: number): void {
  expect(panelViolations(panel, kerfMm)).toEqual([]);
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
