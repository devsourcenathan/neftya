import { describe, it, expect } from 'vitest';
import { build } from './build.js';
import { tiltHeightMm } from './fitting.js';
import type { FurnitureInput } from './input.js';
import type { SpaceInput } from './input.js';

/**
 * Est-ce que ça rentre ?
 *
 * L'autre façon de rater un meuble : les panneaux sont justes, le montage est bon, et il ne
 * passe pas. Ce qui est testé ici, c'est surtout qu'on ne crie pas pour rien — un
 * avertissement de trop fait ignorer celui qui comptait.
 */

const BASE: FurnitureInput = {
  dimensions: { widthMm: 1000, heightMm: 2000, depthMm: 400 },
  compartments: [{ shelves: 2, drawers: 0 }],
  material: 'mdf',
  hasBack: true,
};

const codesFor = (space?: SpaceInput, over: Partial<FurnitureInput> = {}) =>
  build({ ...BASE, ...over, ...(space ? { space } : {}) }).warnings.map(
    (warning) => warning.code,
  );

describe('sans emplacement', () => {
  it('ne contrôle rien', () => {
    // Un meuble se conçoit sans savoir où il va. Exiger une niche obligerait à en inventer
    // une, et un chiffre inventé vaut moins que pas de chiffre.
    const codes = codesFor();

    expect(codes).not.toContain('SPACE_TOO_NARROW');
    expect(codes).not.toContain('SPACE_TOO_SHORT');
    expect(codes).not.toContain('CANNOT_TILT_UP');
  });

  it('ne contrôle que les cotes données', () => {
    // On connaît souvent la hauteur sous plafond sans avoir mesuré la largeur.
    const codes = codesFor({ widthMm: 800 });

    expect(codes).toContain('SPACE_TOO_NARROW');
    expect(codes).not.toContain('SPACE_TOO_SHORT');
  });
});

describe('les trois cotes hors-tout', () => {
  it('signalent ce qui dépasse, et rien d’autre', () => {
    expect(codesFor({ widthMm: 900 })).toContain('SPACE_TOO_NARROW');
    expect(codesFor({ widthMm: 1000 })).not.toContain('SPACE_TOO_NARROW');
    expect(codesFor({ depthMm: 300 })).toContain('SPACE_TOO_SHALLOW');
    expect(codesFor({ depthMm: 400 })).not.toContain('SPACE_TOO_SHALLOW');
  });

  it('comparent le meuble posé, pieds compris', () => {
    // 2000 de caisson sur 120 de pieds font 2120 : ce sont eux qui touchent le plafond.
    const legs = { parameters: { legHeightMm: 120 } } as Partial<FurnitureInput>;

    expect(codesFor({ heightMm: 2050 }, legs)).toContain('SPACE_TOO_SHORT');
    expect(codesFor({ heightMm: 2050 })).not.toContain('SPACE_TOO_SHORT');
  });
});

describe('le redressement sur place', () => {
  it('mesure la diagonale, pas la hauteur', () => {
    // C'est le coin opposé qui décrit l'arc, et son rayon vaut la diagonale du profil.
    expect(tiltHeightMm(2000, 400)).toBe(2040);
    expect(tiltHeightMm(2400, 600)).toBe(2474);
    // Un meuble sans profondeur ne bascule pas : la diagonale vaut sa hauteur.
    expect(tiltHeightMm(2000, 0)).toBe(2000);
  });

  it('signale le meuble qui tient debout mais ne peut pas être levé', () => {
    /*
     * **C'est le cas que personne ne voit venir.** 2 000 de haut dans 2 100 sous plafond :
     * le meuble tient largement debout. Mais il se monte à plat, et pendant la bascule il
     * lui faut 2 040 — ça passe. À 2 020 de plafond, il tient debout et ne se lève pas.
     */
    const codes = codesFor({ heightMm: 2020 });

    expect(codes).toContain('CANNOT_TILT_UP');
    expect(codes).not.toContain('SPACE_TOO_SHORT');
  });

  it('se tait quand le meuble ne tient déjà pas debout', () => {
    // Répéter qu'il ne se redresse pas noierait le seul avertissement qui apprend quelque
    // chose. Un meuble trop haut est trop haut, et on le sait déjà.
    const codes = codesFor({ heightMm: 1500 });

    expect(codes).toContain('SPACE_TOO_SHORT');
    expect(codes).not.toContain('CANNOT_TILT_UP');
  });

  it('se tait quand le plafond est franc', () => {
    expect(codesFor({ heightMm: 2500 })).not.toContain('CANNOT_TILT_UP');
  });
});

describe('la plinthe', () => {
  it('écarte le meuble du mur', () => {
    const furniture = build({
      ...BASE,
      space: { skirtingHeightMm: 80, skirtingDepthMm: 20 },
    });

    const warning = furniture.warnings.find(
      (candidate) => candidate.code === 'SKIRTING_HOLDS_OFF',
    );

    expect(warning?.details['gapMm']).toBe(20);
    // 400 de meuble plus 20 de plinthe : c'est la place qu'il prend réellement.
    expect(warning?.details['totalDepthMm']).toBe(420);
  });

  it('ne gêne pas un meuble monté sur des pieds plus hauts qu’elle', () => {
    // Il passe au-dessus et touche le mur. L'avertir serait du bruit.
    const codes = codesFor({ skirtingHeightMm: 80, skirtingDepthMm: 20 }, {
      parameters: { legHeightMm: 100 },
    } as Partial<FurnitureInput>);

    expect(codes).not.toContain('SKIRTING_HOLDS_OFF');
  });
});

describe('le débattement des portes', () => {
  it('annonce la largeur du plus large vantail', () => {
    const furniture = build({
      ...BASE,
      compartments: [{ shelves: 2, drawers: 0, doors: 1 }],
      space: { widthMm: 1200 },
    });

    const warning = furniture.warnings.find(
      (candidate) => candidate.code === 'DOOR_SWING_CLEARANCE',
    );

    const leaf = furniture.parts.find((part) => part.role === 'door');

    expect(warning).toBeDefined();
    expect(warning?.details['clearanceMm']).toBe(leaf?.instances[0]?.sizeXMm);
  });

  it('prend la largeur dans le repère du meuble, pas la plus grande cote de la pièce', () => {
    /*
     * Un meuble bas et large : la porte mesure 900 de large pour 400 de haut, et la `Part`
     * annonce donc 900 en longueur. Lire `widthMm` aurait annoncé 400 de débattement pour
     * une porte qui en balaie 900 — faux exactement là où ça compte, devant un meuble TV.
     */
    const furniture = build({
      dimensions: { widthMm: 1000, heightMm: 500, depthMm: 400 },
      compartments: [{ shelves: 0, drawers: 0, doors: 1 }],
      material: 'mdf',
      hasBack: true,
      space: { widthMm: 1200 },
    });

    const door = furniture.parts.find((part) => part.role === 'door');
    const warning = furniture.warnings.find(
      (candidate) => candidate.code === 'DOOR_SWING_CLEARANCE',
    );

    // La pièce est plus large que haute : sa « longueur » est sa largeur.
    expect(door?.lengthMm).toBeGreaterThan(door?.widthMm ?? 0);
    expect(warning?.details['clearanceMm']).toBe(door?.instances[0]?.sizeXMm);
    expect(warning?.details['clearanceMm']).not.toBe(door?.widthMm);
  });

  it('se tait sur un meuble sans porte', () => {
    expect(codesFor({ widthMm: 1200 })).not.toContain('DOOR_SWING_CLEARANCE');
  });
});
