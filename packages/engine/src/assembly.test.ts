import { describe, it, expect } from 'vitest';
import { build } from './build.js';
import { assemblySteps } from './assembly.js';
import { furnitureInput } from './input.js';

/**
 * Le guide d'assemblage, et la quantité de visserie qu'il annonce.
 *
 * Ce fichier existe pour une raison précise : la visserie était comptée sur **la première**
 * pièce du rôle. Deux côtés identiques sont une pièce en quantité deux, donc le compte
 * tombait juste — et il suffit que deux compartiments n'aient pas la même largeur pour que
 * les étagères deviennent deux pièces distinctes, et que l'apprenti reçoive la moitié des
 * taquets. Il s'en aperçoit au montage, quand il n'y a plus rien à faire.
 */

const piece = (input: Parameters<typeof furnitureInput.parse>[0]) =>
  build(furnitureInput.parse(input));

const step = (furniture: ReturnType<typeof build>, key: string) => {
  const found = assemblySteps(furniture).find((candidate) => candidate.key === key);
  if (!found) throw new Error(`étape ${key} absente`);
  return found;
};

describe('la visserie compte toutes les pièces du rôle', () => {
  it('compte deux étagères de largeurs différentes, pas une', () => {
    const furniture = piece({
      dimensions: { widthMm: 1800, heightMm: 900, depthMm: 450 },
      compartments: [{ shelves: 1, widthMm: 500 }, { shelves: 1 }],
      material: 'mdf',
      hasBack: true,
    });

    const shelves = step(furniture, 'shelves');

    // Deux pièces distinctes, parce que les compartiments n'ont pas la même largeur.
    expect(shelves.parts).toHaveLength(2);
    // Quatre taquets par étagère : huit, et non quatre.
    expect(shelves.fastener?.quantity).toBe(8);
  });

  it('compte une étagère en double exemplaire comme deux', () => {
    const furniture = piece({
      dimensions: { widthMm: 1800, heightMm: 900, depthMm: 450 },
      compartments: [{ shelves: 1 }, { shelves: 1 }],
      material: 'mdf',
      hasBack: true,
    });

    const shelves = step(furniture, 'shelves');

    // Même largeur : une seule pièce, en quantité deux. Le compte doit être le même que
    // ci-dessus — c'est le même meuble à un millimètre près.
    expect(shelves.parts).toHaveLength(1);
    expect(shelves.fastener?.quantity).toBe(8);
  });

  it('compte les deux façades de tiroir', () => {
    const furniture = piece({
      dimensions: { widthMm: 1200, heightMm: 900, depthMm: 450 },
      compartments: [{ drawers: 1 }, { drawers: 1 }],
      material: 'mdf',
      hasBack: true,
    });

    const faces = step(furniture, 'drawer_faces');

    expect(faces.fastener?.quantity).toBe(faces.parts.length === 1 ? 2 : 2);
  });

  it('n’annonce aucune visserie là où il n’y en a pas', () => {
    const furniture = piece({
      dimensions: { widthMm: 900, heightMm: 900, depthMm: 400 },
      compartments: [{ shelves: 0 }],
      material: 'mdf',
      hasBack: true,
    });

    // Le fond entre en rainure : rien ne le visse, et annoncer une quantité nulle ferait
    // chercher un sachet qui n'existe pas.
    expect(step(furniture, 'back').fastener).toBeUndefined();
  });
});
