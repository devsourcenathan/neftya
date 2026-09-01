import { describe, it, expect } from 'vitest';
import { build } from './build.js';
import { cutList, totalEdgeBandingMm } from './cut-list.js';
import type { FurnitureInput } from './input.js';

/**
 * Le meuble de référence du §10 de docs/NEFTYA_ENGINE.md.
 *
 * 1800 × 600 × 400, MDF 18, fond 8 rainuré, un séparateur central, une étagère par
 * compartiment. C'est le critère de sortie de la phase 1 : le moteur doit reproduire
 * exactement le tableau documenté.
 */
const REFERENCE: FurnitureInput = {
  dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
  compartments: [
    { shelves: 1, drawers: 0 },
    { shelves: 1, drawers: 0 },
  ],
  material: 'mdf',
};

describe('meuble de référence', () => {
  const furniture = build(REFERENCE);
  const rows = cutList(furniture);

  it('reproduit le tableau de pièces documenté', () => {
    expect(
      rows.map((row) => ({
        role: row.role,
        lengthMm: row.lengthMm,
        widthMm: row.widthMm,
        thicknessMm: row.thicknessMm,
        quantity: row.quantity,
      })),
    ).toEqual([
      { role: 'top', lengthMm: 1800, widthMm: 400, thicknessMm: 18, quantity: 1 },
      { role: 'bottom', lengthMm: 1800, widthMm: 400, thicknessMm: 18, quantity: 1 },
      { role: 'side', lengthMm: 564, widthMm: 400, thicknessMm: 18, quantity: 2 },
      { role: 'divider', lengthMm: 564, widthMm: 382, thicknessMm: 18, quantity: 1 },
      // 873 d'ouverture moins 2 mm de jeu par côté : une étagère coupée à la cote exacte
      // ne s'engage pas entre deux panneaux déjà posés.
      { role: 'shelf', lengthMm: 869, widthMm: 382, thicknessMm: 18, quantity: 2 },
      { role: 'back', lengthMm: 1772, widthMm: 572, thicknessMm: 8, quantity: 1 },
    ]);
  });

  it('attribue des identifiants stables', () => {
    expect(rows.map((row) => row.id)).toEqual([
      'P01',
      'P02',
      'P03',
      'P04',
      'P05',
      'P06',
    ]);
  });

  it('recompose la largeur hors-tout', () => {
    // 18 + 873 + 18 + 873 + 18 = 1800.
    //
    // La recomposition porte sur les **panneaux verticaux et les vides entre eux**, pas
    // sur les étagères : depuis qu'elles ont un jeu, une étagère ne mesure plus son
    // ouverture. La version précédente s'en servait comme raccourci, et ce raccourci
    // cachait l'invariant au lieu de le vérifier.
    const verticals = furniture.parts
      .filter((part) => part.role === 'side' || part.role === 'divider')
      .flatMap((part) => part.instances)
      .map((placement) => ({
        fromMm: placement.xMm,
        toMm: placement.xMm + placement.sizeXMm,
      }))
      .sort((a, b) => a.fromMm - b.fromMm);

    expect(verticals).toHaveLength(3);
    expect(verticals[0]?.fromMm).toBe(0);
    expect(verticals.at(-1)?.toMm).toBe(1800);

    // Chaque vide entre deux panneaux est une ouverture de compartiment.
    const openings = verticals
      .slice(1)
      .map((panel, index) => panel.fromMm - (verticals[index]?.toMm ?? 0));

    expect(openings).toEqual([873, 873]);

    const total =
      verticals.reduce((sum, panel) => sum + (panel.toMm - panel.fromMm), 0) +
      openings.reduce((sum, opening) => sum + opening, 0);

    expect(total).toBe(1800);
  });

  it('donne à l’étagère son jeu, et la centre dans son ouverture', () => {
    const shelf = furniture.parts.find((part) => part.role === 'shelf');

    expect(shelf?.lengthMm).toBe(869);
    // Centrée : 18 d'épaisseur de côté plus 2 de jeu.
    expect(shelf?.instances[0]?.xMm).toBe(20);
  });

  it('recompose la hauteur hors-tout', () => {
    const sideHeight = rows.find((row) => row.role === 'side')?.lengthMm ?? 0;
    expect(18 + sideHeight + 18).toBe(600);
  });

  it('arrête les étagères devant le fond', () => {
    // 400 − 18 de retrait = 382.
    expect(rows.find((row) => row.role === 'shelf')?.widthMm).toBe(382);
    // Le dessus, lui, va jusqu'à l'arrière et porte la rainure.
    expect(rows.find((row) => row.role === 'top')?.widthMm).toBe(400);
  });

  it('loge le fond dans sa rainure', () => {
    // (1800 − 36) + 2×4 = 1772 ; (600 − 36) + 2×4 = 572.
    const back = rows.find((row) => row.role === 'back');
    expect(back?.lengthMm).toBe(1772);
    expect(back?.widthMm).toBe(572);
  });

  it('compte le métrage de chant', () => {
    // 1800×2 + 564×2 + 564 + 869×2 = 7030 mm.
    expect(totalEdgeBandingMm(furniture)).toBe(7030);
  });

  it('signale la flèche de l’étagère', () => {
    // 869 mm de portée en MDF 18 sous 20 kg : la flèche dépasse encore l'admissible.
    const warning = furniture.warnings.find((w) => w.code === 'SHELF_DEFLECTION');
    expect(warning).toBeDefined();
    expect(warning?.details['deflectionMm']).toBeCloseTo(3.05, 1);
    expect(warning?.details['limitMm']).toBeCloseTo(2.91, 1);
  });

  it('est déterministe', () => {
    expect(build(REFERENCE)).toEqual(build(REFERENCE));
  });
});

describe('propagation par étirement', () => {
  it('garde le nombre de compartiments quand la largeur change', () => {
    const at1800 = build({
      ...REFERENCE,
      dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
    });
    const at2200 = build({
      ...REFERENCE,
      dimensions: { widthMm: 2200, heightMm: 600, depthMm: 400 },
    });

    const dividers = (f: typeof at1800) =>
      f.parts.filter((part) => part.role === 'divider').length;

    expect(dividers(at1800)).toBe(dividers(at2200));
  });

  it('étire les compartiments, sans en ajouter', () => {
    const three: FurnitureInput = {
      dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
      compartments: [{ shelves: 0 }, { shelves: 0 }, { shelves: 0 }],
    };

    // 1800 − 2×18 (côtés) − 2×18 (séparateurs) = 1728, en 3 → 576.
    // Les deux séparateurs sont identiques : une seule pièce, deux instances.
    const dividerPositions = (f: ReturnType<typeof build>) =>
      f.parts
        .filter((part) => part.role === 'divider')
        .flatMap((part) => part.instances.map((instance) => instance.xMm));

    expect(dividerPositions(build(three))).toEqual([594, 1188]);

    // 2200 : 2164 intérieur, 2128 disponible → 709 / 709 / 710.
    const at2200 = build({
      ...three,
      dimensions: { widthMm: 2200, heightMm: 600, depthMm: 400 },
    });
    expect(dividerPositions(at2200)).toEqual([727, 1454]);
  });
});

describe('tiroirs', () => {
  const withDrawers = build({
    dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
    compartments: [{ drawers: 1 }, { drawers: 1 }, { drawers: 1 }],
  });

  it('déduit le jeu des coulisses de la largeur du caisson', () => {
    // Compartiment 576, jeu 13 par côté → 550 hors-tout, devant/dos 550 − 36 = 514.
    // La cote de découpe met la plus grande dimension d'abord : ici la hauteur.
    const front = withDrawers.parts.find((part) => part.role === 'drawer_front_panel');
    expect([front?.lengthMm, front?.widthMm]).toEqual([564, 514]);
  });

  it('arrête le tiroir devant le fond', () => {
    // 400 − 18 (retrait) − 10 (jeu arrière) = 372.
    const side = withDrawers.parts.find((part) => part.role === 'drawer_side');
    expect([side?.lengthMm, side?.widthMm]).toEqual([564, 372]);
  });

  it('pave la façade du meuble', () => {
    // Chaque jeu est centré sur son séparateur, et non posé par division uniforme. Les
    // façades d'extrémité sont donc plus larges : elles couvrent aussi le côté du
    // caisson, ce que fait un recouvrement total sur un vrai meuble.
    const widths = withDrawers.parts
      .filter((part) => part.role === 'drawer_face')
      .flatMap((part) => part.instances.map((instance) => instance.sizeXMm));

    expect(widths).toEqual([602, 591, 601]);
    // 602 + 3 + 591 + 3 + 601 = 1800.
    expect(widths.reduce((a, b) => a + b, 0) + 2 * 3).toBe(1800);
  });

  it('fait tomber chaque jeu sur un séparateur', () => {
    // La contrainte qui n'est pas évidente : une façade est plus large que son
    // compartiment, et si un jeu tombait à côté d'un séparateur, on verrait à
    // l'intérieur du meuble.
    expect(
      withDrawers.warnings.filter((w) => w.code === 'FRONT_GAP_OFF_DIVIDER'),
    ).toEqual([]);
  });
});

describe('avertissements', () => {
  it('signale un caisson sans fond', () => {
    const open = build({ ...REFERENCE, hasBack: false });
    expect(open.warnings.some((w) => w.code === 'NO_BACK_PANEL')).toBe(true);
    expect(open.parts.some((part) => part.role === 'back')).toBe(false);
  });

  it('ne signale aucune flèche sur une portée courte', () => {
    const narrow = build({
      dimensions: { widthMm: 600, heightMm: 600, depthMm: 400 },
      compartments: [{ shelves: 1 }],
    });
    expect(narrow.warnings.some((w) => w.code === 'SHELF_DEFLECTION')).toBe(false);
  });
});

describe('pieds', () => {
  it('ajoutent à la hauteur au sol sans toucher aux cotes', () => {
    const onLegs = build({
      ...REFERENCE,
      parameters: { legHeightMm: 100 },
    } as FurnitureInput);

    expect(onLegs.totalHeightWithLegsMm).toBe(700);
    // Les côtés ne bougent pas : changer de pieds ne recoupe rien.
    expect(onLegs.parts.find((part) => part.role === 'side')?.lengthMm).toBe(564);
  });
});
