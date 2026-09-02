import { describe, it, expect } from 'vitest';
import { build, type Furniture } from './build.js';
import type { FurnitureInput } from './input.js';
import type { Part, Placement } from './parts.js';
import { drilling, type Hole } from './drilling.js';
import { HINGE, SHELF_SUPPORT, DOWEL, SLIDE_LENGTHS_MM } from './hardware.js';

/**
 * Les perçages.
 *
 * Le test qui compte n'est pas « il y a des trous » : c'est que **les trous des deux
 * pièces d'un même assemblage tombent en face l'un de l'autre**. Un boîtier de charnière
 * et son embase percés chacun correctement mais à deux hauteurs différentes donnent une
 * porte qui ne ferme pas, et les deux pièces prises séparément ont l'air justes.
 *
 * Les coordonnées sont donc systématiquement **ramenées au repère du meuble** ici, par un
 * calcul écrit depuis le contrat documenté et non depuis `part-frame.ts` : un test qui
 * appellerait la fonction qu'il vérifie ne mesurerait qu'elle-même.
 *
 * @see docs/NEFTYA_ENGINE.md §12
 */

const BOOKCASE: FurnitureInput = {
  dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
  compartments: [
    { shelves: 1, drawers: 0, doors: 0 },
    { shelves: 1, drawers: 0, doors: 0 },
  ],
};

/** Un vantail par compartiment : le côté charnière ne peut pas se lire dans la paire. */
const SIDEBOARD: FurnitureInput = {
  dimensions: { widthMm: 1200, heightMm: 900, depthMm: 450 },
  compartments: [
    { shelves: 1, drawers: 0, doors: 1 },
    { shelves: 1, drawers: 0, doors: 1 },
  ],
};

/** Une paire de vantaux de 2 m : quatre charnières chacun. */
const WARDROBE: FurnitureInput = {
  dimensions: { widthMm: 1000, heightMm: 2000, depthMm: 600 },
  compartments: [{ shelves: 2, drawers: 0, doors: 2 }],
};

const CHEST: FurnitureInput = {
  dimensions: { widthMm: 900, heightMm: 800, depthMm: 500 },
  compartments: [{ shelves: 0, drawers: 3, doors: 0 }],
};

/** Un caisson bas et profond : sa longueur de découpe n'est plus sa hauteur. */
const SHALLOW_TALL: FurnitureInput = {
  dimensions: { widthMm: 900, heightMm: 400, depthMm: 700 },
  compartments: [{ shelves: 1, drawers: 0, doors: 1 }],
};

const MODELS: [string, FurnitureInput][] = [
  ['bibliothèque', BOOKCASE],
  ['buffet', SIDEBOARD],
  ['dressing', WARDROBE],
  ['commode', CHEST],
  ['caisson bas et profond', SHALLOW_TALL],
];

type Axis = 'x' | 'y' | 'z';

interface Located {
  partId: string;
  instanceIndex: number;
  hole: Hole;
  part: Part;
  instance: Placement;
  /** Le centre du trou, ramené au repère du meuble. */
  atMm: Record<Axis, number>;
}

/**
 * L'inverse du repère de pièce, réécrit depuis le contrat :
 *
 *  - l'axe traversant est celui dont l'encombrement vaut l'épaisseur et dont les deux
 *    autres redonnent la longueur et la largeur ;
 *  - `xMm` suit `lengthMm`, `yMm` suit `widthMm` ;
 *  - sur `back`, `xMm` est déjà compté depuis l'autre bord.
 */
function locate(furniture: Furniture): Located[] {
  const byId = new Map(furniture.parts.map((part) => [part.id, part]));

  return drilling(furniture).parts.flatMap((drilled) => {
    const part = byId.get(drilled.partId) as Part;
    const instance = part.instances[drilled.instanceIndex] as Placement;
    const sizes: Record<Axis, number> = {
      x: instance.sizeXMm,
      y: instance.sizeYMm,
      z: instance.sizeZMm,
    };
    const origin: Record<Axis, number> = {
      x: instance.xMm,
      y: instance.yMm,
      z: instance.zMm,
    };

    const axes: Axis[] = ['x', 'y', 'z'];
    const through = axes.find((axis) => {
      if (sizes[axis] !== part.thicknessMm) return false;
      const rest = axes.filter((other) => other !== axis).map((other) => sizes[other]);
      return (
        (rest[0] === part.lengthMm && rest[1] === part.widthMm) ||
        (rest[0] === part.widthMm && rest[1] === part.lengthMm)
      );
    }) as Axis;

    const rest = axes.filter((axis) => axis !== through);
    const lengthAxis = (rest.find((axis) => sizes[axis] === part.lengthMm) ??
      rest[0]) as Axis;
    const widthAxis = rest.find((axis) => axis !== lengthAxis) as Axis;

    return drilled.holes.map((hole) => {
      const atMm = { ...origin };

      if (hole.side === 'front' || hole.side === 'back') {
        const along = hole.side === 'front' ? hole.xMm : part.lengthMm - hole.xMm;
        atMm[lengthAxis] = origin[lengthAxis] + along;
        atMm[widthAxis] = origin[widthAxis] + hole.yMm;
        atMm[through] =
          hole.side === 'front'
            ? origin[through]
            : origin[through] + part.thicknessMm;
      } else {
        // Un chant : `xMm` court le long du chant, `yMm` s'enfonce depuis la face `front`.
        const alongAxis = hole.side.startsWith('edge_x') ? widthAxis : lengthAxis;
        const endAxis = hole.side.startsWith('edge_x') ? lengthAxis : widthAxis;
        const endSize = endAxis === lengthAxis ? part.lengthMm : part.widthMm;

        atMm[alongAxis] = origin[alongAxis] + hole.xMm;
        atMm[endAxis] = hole.side.endsWith('_min')
          ? origin[endAxis]
          : origin[endAxis] + endSize;
        atMm[through] = origin[through] + hole.yMm;
      }

      return { partId: part.id, instanceIndex: drilled.instanceIndex, hole, part, instance, atMm };
    });
  });
}

const purposed = (located: Located[], purpose: Hole['purpose']) =>
  located.filter((entry) => entry.hole.purpose === purpose);

describe('le repère de chaque trou', () => {
  it.each(MODELS)('reste dans la pièce — %s', (_name, input) => {
    const violations: string[] = [];

    for (const { partId, part, hole } of locate(build(input))) {
      const radius = hole.diameterMm / 2;

      if (hole.side === 'front' || hole.side === 'back') {
        // Un trou dont le bord sort de la pièce est un trou qui débouche sur le chant.
        if (hole.xMm - radius < 0 || hole.xMm + radius > part.lengthMm) {
          violations.push(`${partId} x=${hole.xMm} hors de 0..${part.lengthMm}`);
        }
        if (hole.yMm - radius < 0 || hole.yMm + radius > part.widthMm) {
          violations.push(`${partId} y=${hole.yMm} hors de 0..${part.widthMm}`);
        }
      }

      // Aucun perçage du moteur ne traverse : un foret qui sort de l'autre face abîme
      // une face visible, et l'assemblage ne tient plus mieux pour autant.
      if (hole.depthMm >= part.thicknessMm) {
        violations.push(`${partId} profondeur ${hole.depthMm} >= ${part.thicknessMm}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('compte les coordonnées depuis la face qu’on perce', () => {
    // Les deux côtés d'un caisson sont **la même pièce** en quantité 2, et se percent
    // chacun sur sa face intérieure : celle qui regarde le minimum de l'axe pour l'un,
    // le maximum pour l'autre. Donner une coordonnée unique obligerait l'atelier à faire
    // le miroir de tête.
    const supports = purposed(locate(build(WARDROBE)), 'shelf_support').filter(
      (entry) => entry.part.role === 'side',
    );
    const sides = new Set(supports.map((entry) => entry.hole.side));

    expect(sides).toEqual(new Set(['front', 'back']));
    // Et malgré des repères opposés, les deux montants sont percés aux mêmes hauteurs
    // dans le meuble.
    const heights = new Map<'front' | 'back', number[]>();
    for (const entry of supports) {
      const key = entry.hole.side as 'front' | 'back';
      heights.set(key, [...(heights.get(key) ?? []), entry.atMm.y].sort((a, b) => a - b));
    }

    expect(heights.get('front')).toEqual(heights.get('back'));
  });
});

describe('taquets d’étagère', () => {
  it('en pose quatre par étagère, deux par montant', () => {
    const furniture = build(BOOKCASE);
    const shelves = furniture.parts
      .filter((part) => part.role === 'shelf')
      .reduce((total, part) => total + part.quantity, 0);

    expect(purposed(locate(furniture), 'shelf_support')).toHaveLength(shelves * 4);
  });

  it('les aligne sur la ligne système 32, devant et derrière', () => {
    const furniture = build(BOOKCASE);
    const shelf = furniture.parts.find((part) => part.role === 'shelf') as Part;
    const instance = shelf.instances[0] as Placement;

    const depths = new Set(
      purposed(locate(furniture), 'shelf_support').map((entry) => entry.atMm.z),
    );

    expect(depths).toContain(instance.zMm + SHELF_SUPPORT.frontOffsetMm);
    expect(depths).toContain(
      instance.zMm + instance.sizeZMm - SHELF_SUPPORT.backOffsetMm,
    );
  });

  it('les place juste sous l’étagère, jamais au-dessus', () => {
    const furniture = build(BOOKCASE);
    const shelfTops = furniture.parts
      .filter((part) => part.role === 'shelf')
      .flatMap((part) => part.instances.map((instance) => instance.yMm));

    for (const entry of purposed(locate(furniture), 'shelf_support')) {
      const shelf = shelfTops.find((yMm) => Math.abs(yMm - entry.atMm.y) < 20);

      expect(shelf).toBeDefined();
      // Un taquet posé au niveau de l'étagère, ou au-dessus, la soulève.
      expect(entry.atMm.y).toBeLessThan(shelf as number);
    }
  });
});

describe('charnières', () => {
  it('fraise le boîtier sur la face qui regarde le caisson', () => {
    for (const entry of purposed(locate(build(WARDROBE)), 'hinge_cup')) {
      // Un boîtier fraisé sur la face visible se voit, porte fermée, toute la vie du
      // meuble.
      const [zMin, zMax] = [entry.instance.zMm, entry.instance.zMm + entry.instance.sizeZMm];

      expect(entry.atMm.z).toBe(Math.max(zMin, zMax));
    }
  });

  it('charnière les deux vantaux d’une paire sur des chants opposés', () => {
    const located = locate(build(WARDROBE));
    const cups = purposed(located, 'hinge_cup');

    const byLeaf = new Map<number, number[]>();
    for (const entry of cups) {
      byLeaf.set(entry.instanceIndex, [
        ...(byLeaf.get(entry.instanceIndex) ?? []),
        entry.atMm.x,
      ]);
    }

    expect(byLeaf.size).toBe(2);
    const [first, second] = [...byLeaf.values()];

    // Les deux vantaux sont la même `Part` en quantité 2. Percés une seule fois pour les
    // deux, ils charnièreraient du même côté et la porte de droite ouvrirait dans le vide.
    const centre = 1000 / 2;
    expect(first?.every((xMm) => xMm < centre)).toBe(true);
    expect(second?.every((xMm) => xMm > centre)).toBe(true);
  });

  it('mesure le boîtier depuis le chant charnière, sur les deux vantaux', () => {
    for (const entry of purposed(locate(build(WARDROBE)), 'hinge_cup')) {
      const { instance } = entry;
      const fromLeft = entry.atMm.x - instance.xMm;
      const fromRight = instance.xMm + instance.sizeXMm - entry.atMm.x;

      expect(Math.min(fromLeft, fromRight)).toBe(HINGE.cupInsetMm);
    }
  });

  it('met chaque embase à la hauteur de son boîtier', () => {
    // **C'est le test qui compte.** Deux pièces percées chacune correctement mais à deux
    // hauteurs différentes donnent une porte qui ne ferme pas, et prises séparément elles
    // ont l'air justes toutes les deux.
    for (const input of [WARDROBE, SIDEBOARD]) {
      const located = locate(build(input));
      const cups = purposed(located, 'hinge_cup').map((entry) => entry.atMm.y);
      const plates = purposed(located, 'hinge_plate').map((entry) => entry.atMm.y);

      expect(new Set(plates)).toEqual(new Set(cups));
      // Deux trous d'embase par charnière, un boîtier.
      expect(plates.length).toBe(cups.length * 2);
    }
  });

  it('perce l’embase dans le montant qui regarde le vantail', () => {
    const located = locate(build(SIDEBOARD));
    const plates = purposed(located, 'hinge_plate');

    expect(plates.length).toBeGreaterThan(0);
    for (const entry of plates) {
      expect(['side', 'divider']).toContain(entry.part.role);
      // À 37 puis 69 mm du chant avant : le bras de la charnière ne va pas plus loin.
      expect([HINGE.plateFrontOffsetMm, HINGE.plateFrontOffsetMm + HINGE.plateHolePitchMm])
        .toContain(entry.atMm.z);
    }
  });

  it('charnière un vantail unique à gauche, par convention', () => {
    const cups = purposed(locate(build(SIDEBOARD)), 'hinge_cup');

    // Les deux vantaux de ce buffet n'ont pas la même largeur — le jeu est centré sur le
    // séparateur — et sont donc deux `Part` distinctes. Chaque trou porte son instance.
    expect(cups.length).toBe(4);
    for (const entry of cups) {
      expect(entry.atMm.x - entry.instance.xMm).toBe(HINGE.cupInsetMm);
    }
  });
});

describe('coulisses', () => {
  it('retient une longueur du catalogue, jamais une cote calculée', () => {
    const result = drilling(build(CHEST));
    const keys = result.hardware
      .map((line) => line.key)
      .filter((key) => key.startsWith('slide_'));

    expect(keys.length).toBe(1);
    const lengthMm = Number(keys[0]?.replace('slide_ball_', ''));

    expect(SLIDE_LENGTHS_MM).toContain(lengthMm as (typeof SLIDE_LENGTHS_MM)[number]);
  });

  it('ne retient jamais une coulisse plus longue que le caisson', () => {
    for (const depthMm of [300, 400, 450, 500, 600, 700]) {
      const furniture = build({ ...CHEST, dimensions: { widthMm: 900, heightMm: 800, depthMm } });
      const boxDepth = (
        furniture.parts.find((part) => part.role === 'drawer_side')
          ?.instances[0] as Placement
      ).sizeZMm;

      const key = drilling(furniture)
        .hardware.map((line) => line.key)
        .find((candidate) => candidate.startsWith('slide_'));

      if (!key) continue;
      // Une coulisse qui dépasse du caisson empêche le tiroir de fermer.
      expect(Number(key.replace('slide_ball_', ''))).toBeLessThanOrEqual(boxDepth);
    }
  });

  it('met les deux profils d’une coulisse à la même hauteur', () => {
    const located = locate(build(CHEST));
    const onDrawer = purposed(located, 'slide_drawer').map((entry) => entry.atMm.y);
    const onCabinet = purposed(located, 'slide_cabinet').map((entry) => entry.atMm.y);

    expect(onDrawer.length).toBeGreaterThan(0);
    // Un profil de caisson décalé d'un centimètre coince le tiroir au premier centimètre.
    expect(new Set(onCabinet)).toEqual(new Set(onDrawer));
  });

  it('signale un caisson trop peu profond plutôt que d’inventer une coulisse', () => {
    const shallow = build({
      dimensions: { widthMm: 900, heightMm: 800, depthMm: 220 },
      compartments: [{ shelves: 0, drawers: 2, doors: 0 }],
    });
    const result = drilling(shallow);

    expect(result.warnings.map((warning) => warning.code)).toContain('NO_SLIDE_FITS');
    expect(result.hardware.some((line) => line.key.startsWith('slide_'))).toBe(false);
  });
});

describe('tourillons', () => {
  it('perce le chant du séparateur et la face en face, au même endroit', () => {
    const located = locate(build(BOOKCASE));
    const dowels = purposed(located, 'dowel');

    const onDivider = dowels.filter((entry) => entry.part.role === 'divider');
    const onPanels = dowels.filter((entry) => entry.part.role !== 'divider');

    expect(onDivider.length).toBeGreaterThan(0);
    expect(onPanels).toHaveLength(onDivider.length);

    // Chaque tourillon est **un** article et **deux** trous, aux mêmes coordonnées de
    // meuble. Deux trous qui ne se font pas face, c'est un séparateur qui ne rentre pas.
    const key = (entry: Located) =>
      `${entry.atMm.x}|${entry.atMm.y}|${entry.atMm.z}`;

    expect(new Set(onPanels.map(key))).toEqual(new Set(onDivider.map(key)));
  });

  it('les centre dans l’épaisseur du séparateur', () => {
    const located = locate(build(BOOKCASE));

    for (const entry of purposed(located, 'dowel')) {
      if (entry.part.role !== 'divider') continue;

      expect(entry.hole.yMm).toBe(Math.round(entry.part.thicknessMm / 2));
      expect(entry.hole.side.startsWith('edge_')).toBe(true);
    }
  });

  it('ne perce pas plus profond que le panneau qui reçoit', () => {
    for (const entry of purposed(locate(build(BOOKCASE)), 'dowel')) {
      // 16 mm dans un panneau de 18 : deux millimètres de matière restent, et le foret ne
      // sort pas sur le dessus du meuble.
      expect(DOWEL.holeDepthMm).toBeLessThan(entry.part.thicknessMm);
    }
  });
});

describe('quincaillerie déduite des trous', () => {
  it('compte une charnière par boîtier, pas par trou', () => {
    const furniture = build(WARDROBE);
    const result = drilling(furniture);
    const cups = purposed(locate(furniture), 'hinge_cup').length;

    expect(result.hardware.find((line) => line.key === HINGE.key)?.quantity).toBe(cups);
    // Deux vantaux de 2 m : quatre charnières chacun.
    expect(cups).toBe(8);
  });

  it('compte un tourillon pour deux trous', () => {
    const furniture = build(BOOKCASE);
    const holes = purposed(locate(furniture), 'dowel').length;

    expect(drilling(furniture).hardware.find((line) => line.key === DOWEL.key)?.quantity)
      .toBe(holes / 2);
  });

  it('compte une paire de coulisses par tiroir', () => {
    const furniture = build(CHEST);
    const slides = drilling(furniture).hardware.find((line) =>
      line.key.startsWith('slide_'),
    );

    expect(slides?.quantity).toBe(3);
  });
});

describe('le moteur reste pur', () => {
  it('rend le même perçage pour la même entrée', () => {
    for (const [, input] of MODELS) {
      expect(drilling(build(input))).toEqual(drilling(build(input)));
    }
  });

  it('ne touche pas au meuble qu’on lui donne', () => {
    const furniture = build(WARDROBE);
    const before = JSON.stringify(furniture);

    drilling(furniture);

    expect(JSON.stringify(furniture)).toBe(before);
  });
});
