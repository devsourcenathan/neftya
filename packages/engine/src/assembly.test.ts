import { describe, it, expect } from 'vitest';
import { build } from './build.js';
import { assemblySteps } from './assembly.js';
import { furnitureInput } from './input.js';
import { drilling } from './drilling.js';

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

/**
 * **Ce qu'une étape nomme doit pouvoir se commander.**
 *
 * L'étape des façades annonçait `drawer_slide_pair`, la référence générique retirée du
 * catalogue le 2 septembre, pendant que la nomenclature disait `slide_ball_400`. Deux noms
 * pour le même article, et un seul se commande : l'apprenti part acheter ce qui n'existe
 * plus. L'étape des portes, elle, ne nommait aucune charnière alors que la nomenclature en
 * comptait quatre.
 *
 * Cet invariant est le contrôle qui manquait. Il ne vérifie pas une valeur, il vérifie que
 * les deux listes parlent de la même chose.
 */
describe('le guide et la nomenclature nomment les mêmes articles', () => {
  const pieces = [
    {
      dimensions: { widthMm: 1200, heightMm: 900, depthMm: 450 },
      compartments: [
        { shelves: 1, drawers: 1, doors: 1 },
        { shelves: 1, drawers: 1, doors: 1 },
      ],
      material: 'mdf' as const,
      hasBack: true,
    },
    {
      dimensions: { widthMm: 2000, heightMm: 2400, depthMm: 600 },
      compartments: [{ doors: 2 }, { shelves: 3, drawers: 2, widthMm: 700 }],
      material: 'melamine' as const,
      hasBack: true,
    },
  ];

  it('nomme une référence que la quincaillerie connaît', () => {
    for (const input of pieces) {
      const furniture = piece(input);
      const stock = new Map<string, number>(
        drilling(furniture).hardware.map((line) => [line.key as string, line.quantity]),
      );

      for (const assembled of assemblySteps(furniture)) {
        const fastener = assembled.fastener;
        if (!fastener) continue;

        // Les vis du caisson sont comptées depuis les côtés, pas depuis un perçage : elles
        // n'ont pas de trou à elles.
        if (fastener.key === 'screw_4x50') continue;

        expect(
          stock.has(fastener.key),
          `l'étape « ${assembled.key} » nomme ${fastener.key}, absent de la quincaillerie`,
        ).toBe(true);
      }
    }
  });

  it('n’en demande jamais plus que ce qui est commandé', () => {
    for (const input of pieces) {
      const furniture = piece(input);
      const stock = new Map<string, number>(
        drilling(furniture).hardware.map((line) => [line.key as string, line.quantity]),
      );

      for (const assembled of assemblySteps(furniture)) {
        const fastener = assembled.fastener;
        if (!fastener || fastener.key === 'screw_4x50') continue;

        // Un guide qui demande huit taquets quand la liste en fait acheter quatre envoie
        // quelqu'un au magasin au milieu du montage.
        expect(fastener.quantity).toBeLessThanOrEqual(stock.get(fastener.key) ?? 0);
      }
    }
  });

  it('ne pose pas une porte sans dire avec quoi', () => {
    const furniture = piece(pieces[0]!);
    const doors = step(furniture, 'doors');

    expect(doors.fastener?.key).toBe('hinge_35_110');
    expect(doors.fastener?.quantity).toBeGreaterThan(0);
  });
});
