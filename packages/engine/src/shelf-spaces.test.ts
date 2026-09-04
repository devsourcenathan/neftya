import { describe, it, expect } from 'vitest';
import { build } from './build.js';
import type { FurnitureInput } from './input.js';
import { recomposes } from './millimetres.js';
import { shareSpace } from './share.js';

/**
 * Les hauteurs d'espace imposées, étagère par étagère.
 *
 * `n` étagères découpent un compartiment en `n + 1` espaces. Jusqu'ici la division égale
 * décidait des trois : un espace de 400 mm en bas pour les cartons à archives, le reste
 * réparti au-dessus, ne s'exprimait pas.
 *
 * C'est **la même règle que les largeurs de compartiment**, appliquée à la hauteur — et
 * c'est le même code, extrait dans `share.ts`. Deux écritures de la même règle divergent
 * le jour où l'une est corrigée.
 *
 * @see docs/NEFTYA_ENGINE.md §7.3
 */

const BOOKCASE: FurnitureInput = {
  dimensions: { widthMm: 900, heightMm: 2000, depthMm: 400 },
  compartments: [{ shelves: 3 }],
};

/** La hauteur intérieure, moins ce que les étagères occupent. */
function usableHeight(input: FurnitureInput, shelves: number): number {
  const thickness = 18;
  return input.dimensions.heightMm - 2 * thickness - shelves * thickness;
}

/** Les espaces réellement obtenus, lus sur la position des étagères. */
function spacesOf(input: FurnitureInput): number[] {
  const furniture = build(input);
  const thickness = 18;
  const shelfTops = furniture.parts
    .filter((part) => part.role === 'shelf')
    .flatMap((part) => part.instances)
    .map((placement) => placement.yMm)
    .sort((a, b) => a - b);

  const spaces: number[] = [];
  let floor = thickness;

  for (const top of shelfTops) {
    spaces.push(top - floor);
    floor = top + thickness;
  }
  spaces.push(input.dimensions.heightMm - thickness - floor);

  return spaces;
}

describe('sans hauteur imposée', () => {
  it('se comporte exactement comme avant', () => {
    const spaces = spacesOf(BOOKCASE);

    // Égaux au reste de division près : le reste va au dernier (§7.3).
    expect(spaces).toHaveLength(4);
    expect(Math.max(...spaces) - Math.min(...spaces)).toBeLessThan(spaces.length);
  });

  it('ne pose aucune hauteur dans le modèle', () => {
    expect(build(BOOKCASE).input.compartments[0]?.shelfSpacesMm).toEqual([]);
  });
});

describe('une hauteur imposée', () => {
  const ARCHIVE: FurnitureInput = {
    ...BOOKCASE,
    compartments: [{ shelves: 3, shelfSpacesMm: [400] }],
  };

  it('est honorée au millimètre', () => {
    // Le bas fait 400 : c'est la hauteur d'un carton à archives, et c'est ce qu'on a
    // demandé.
    expect(spacesOf(ARCHIVE)[0]).toBe(400);
  });

  it('laisse les souples se partager le reste', () => {
    const [, ...rest] = spacesOf(ARCHIVE);

    expect(Math.max(...rest) - Math.min(...rest)).toBeLessThan(rest.length);
  });

  it('ne perd pas un millimètre au passage', () => {
    // **L'invariant de recomposition.** Les quatre espaces doivent redonner la hauteur
    // utile, exactement. Un millimètre perdu ici est un jour de jeu dans un meuble monté.
    expect(recomposes(spacesOf(ARCHIVE), usableHeight(ARCHIVE, 3))).toBe(true);
  });

  it('accepte un tableau plus long que le nombre d’espaces', () => {
    // Retirer une étagère laisse un tableau trop long. Le refuser rendrait le modèle
    // invalide pour un geste anodin.
    const stale: FurnitureInput = {
      ...BOOKCASE,
      compartments: [{ shelves: 1, shelfSpacesMm: [400, null, 300, 250] }],
    };

    expect(spacesOf(stale)[0]).toBe(400);
    expect(recomposes(spacesOf(stale), usableHeight(stale, 1))).toBe(true);
  });
});

describe('ce que le moteur refuse de rattraper en silence', () => {
  it('signale des hauteurs qui dépassent la place', () => {
    const tooTall: FurnitureInput = {
      ...BOOKCASE,
      compartments: [{ shelves: 3, shelfSpacesMm: [900, 900, 900] }],
    };

    expect(build(tooTall).warnings.map((warning) => warning.code)).toContain(
      'SHELF_SPACE_MISMATCH',
    );
  });

  it('ne produit jamais une étagère hors du caisson', () => {
    const tooTall: FurnitureInput = {
      ...BOOKCASE,
      compartments: [{ shelves: 3, shelfSpacesMm: [900, 900, 900] }],
    };
    const furniture = build(tooTall);

    for (const part of furniture.parts.filter((entry) => entry.role === 'shelf')) {
      for (const placement of part.instances) {
        expect(placement.yMm).toBeGreaterThanOrEqual(0);
        expect(placement.yMm).toBeLessThanOrEqual(tooTall.dimensions.heightMm);
      }
    }
  });

  it('fait absorber l’écart au dernier quand tout est imposé', () => {
    const all: FurnitureInput = {
      ...BOOKCASE,
      compartments: [{ shelves: 3, shelfSpacesMm: [400, 400, 400, 400] }],
    };

    // La hauteur du caisson fait foi : c'est elle qu'on a déjà sciée.
    expect(build(all).warnings.map((warning) => warning.code)).toContain(
      'SHELF_SPACE_MISMATCH',
    );
    expect(recomposes(spacesOf(all), usableHeight(all, 3))).toBe(true);
  });
});

describe('la règle partagée', () => {
  it('rend la même chose pour des largeurs et pour des hauteurs', () => {
    // Le partage ne connaît ni largeur ni hauteur : c'est ce qui garantit que les deux
    // ne divergeront pas.
    const asWidths = shareSpace([400, null, null], 3, 1800);
    const asHeights = shareSpace([400, null, null], 3, 1800);

    expect(asWidths).toEqual(asHeights);
    expect(asWidths.sizes[0]).toBe(400);
    expect(asWidths.sizes.reduce((total, size) => total + size, 0)).toBe(1800);
  });

  it('ignore une case souple de trop', () => {
    expect(shareSpace([100, 200], 2, 300).sizes).toEqual([100, 200]);
    expect(shareSpace([100, 200, 999], 2, 300).sizes).toEqual([100, 200]);
  });

  it('ne rend jamais une taille négative', () => {
    const crowded = shareSpace([900, 900], 3, 1000);

    for (const size of crowded.sizes) expect(size).toBeGreaterThanOrEqual(0);
    expect(crowded.mismatch).toBe(true);
  });
});
