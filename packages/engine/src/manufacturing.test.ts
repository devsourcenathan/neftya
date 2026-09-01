import { describe, it, expect } from 'vitest';
import { build } from './build.js';
import type { FurnitureInput } from './input.js';
import { nest } from './nesting.js';
import { billOfMaterials } from './bill-of-materials.js';
import { costLines } from './costing.js';
import { assemblySteps } from './assembly.js';

/** Le meuble du §2 de MANUFACTURING.md. */
const REFERENCE: FurnitureInput = {
  dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
  compartments: [
    { shelves: 1, drawers: 0 },
    { shelves: 1, drawers: 0 },
  ],
  material: 'mdf',
  hasBack: true,
};

const furniture = build(REFERENCE);
const nesting = nest(furniture);
const bill = billOfMaterials(furniture, nesting);

describe('liste des matériaux', () => {
  it('compte les panneaux documentés : un de 18 mm, un de 8 mm', () => {
    expect(bill.panels).toEqual([
      {
        material: 'mdf',
        thicknessMm: 18,
        format: { lengthMm: 2440, widthMm: 1220 },
        quantity: 1,
      },
      {
        material: 'mdf',
        thicknessMm: 8,
        format: { lengthMm: 2440, widthMm: 1220 },
        quantity: 1,
      },
    ]);
  });

  it('cumule 7,03 m de chant', () => {
    // P01+P02 : 3600, P03 : 1128, P04 : 564, P05 : 1738 → 7030 mm. Les étagères ayant
    // 2 mm de jeu par côté, elles portent 8 mm de chant de moins que ce qu'annonçait le
    // document d'origine.
    expect(bill.edgeBandingMm).toBe(7030);
  });

  it('compte les panneaux d’après le placement, jamais par division de surfaces', () => {
    // Deux grandes pièces qui ne tiennent pas dans la même bande demandent deux panneaux,
    // même si leur surface cumulée en remplirait un seul. C'est le panneau qu'on paie.
    const large = build({
      dimensions: { widthMm: 2400, heightMm: 2400, depthMm: 600 },
      compartments: [{ shelves: 6, drawers: 0 }],
      material: 'mdf',
      hasBack: true,
    });
    const result = nest(large);
    const thick = result.panels.filter((panel) => panel.thicknessMm === 18);
    const bom = billOfMaterials(large, result);

    expect(bom.panels.find((line) => line.thicknessMm === 18)?.quantity).toBe(
      thick.length,
    );
    expect(thick.length).toBeGreaterThan(1);
  });

  it('déduit les accessoires des assemblages, sans forfait', () => {
    const byKey = Object.fromEntries(
      bill.accessories.map((line) => [line.key, line.quantity]),
    );

    // Deux côtés × 8 vis, une séparation × 8 tourillons, deux étagères × 4 taquets.
    expect(byKey['screw_4x50']).toBe(16);
    expect(byKey['dowel_8']).toBe(8);
    expect(byKey['shelf_support']).toBe(8);
    // Aucun tiroir : la ligne n'existe pas, elle ne vaut pas zéro.
    expect(byKey['drawer_slide_pair']).toBeUndefined();
  });
});

describe('lignes de coût', () => {
  const lines = costLines(bill);

  it('porte des quantités, jamais des prix', () => {
    for (const line of lines) {
      expect(line).not.toHaveProperty('price');
      expect(line).not.toHaveProperty('amount');
      expect(line.quantity).toBeGreaterThan(0);
    }
  });

  it('référence les articles par une clé stable, pas par un libellé', () => {
    // « Panneau MDF 18 mm » changerait de valeur d'une langue à l'autre, et le prix
    // saisi ne se retrouverait plus.
    expect(lines.map((line) => line.reference)).toContain('panel:mdf:18');
    expect(lines.map((line) => line.reference)).toContain('edge_banding');
  });

  it('achète le chant au mètre, arrondi au centième supérieur', () => {
    const banding = lines.find((line) => line.reference === 'edge_banding');

    expect(banding?.unit).toBe('metre');
    expect(banding?.quantity).toBe(7.03);
  });
});

describe('guide d’assemblage', () => {
  const steps = assemblySteps(furniture);

  it('numérote les étapes et donne le total', () => {
    expect(steps[0]?.index).toBe(1);
    expect(steps.every((step) => step.total === steps.length)).toBe(true);
  });

  it('cite les identifiants réels des pièces', () => {
    const first = steps[0];

    expect(first?.key).toBe('carcass');
    expect(first?.parts.map((part) => part.id)).toEqual(['P02', 'P03']);
    // « 4 vis 4 × 50 par côté », comme le document : deux côtés, huit vis pour poser le
    // dessous. Le dessus en demandera huit autres, à l'étape suivante.
    expect(first?.fastener).toEqual({ key: 'screw_4x50', quantity: 8 });
    expect(steps[1]?.fastener).toEqual({ key: 'screw_4x50', quantity: 8 });
  });

  it('retire les étapes sans pièce plutôt que de les afficher vides', () => {
    // Ce meuble n'a pas de tiroir : « posez les tiroirs » n'a pas lieu d'être.
    expect(steps.map((step) => step.key)).not.toContain('drawers');

    const withDrawers = build({
      ...REFERENCE,
      compartments: [
        { shelves: 1, drawers: 2 },
        { shelves: 1, drawers: 0 },
      ],
    });
    expect(assemblySteps(withDrawers).map((step) => step.key)).toContain('drawers');
  });

  it('ne mentionne pas de fond quand il n’y en a pas', () => {
    const openBack = build({ ...REFERENCE, hasBack: false });

    expect(assemblySteps(openBack).map((step) => step.key)).not.toContain('back');
    expect(steps.map((step) => step.key)).toContain('back');
  });
});
