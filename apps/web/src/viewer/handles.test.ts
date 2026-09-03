import { describe, it, expect } from 'vitest';
import { build, compartmentAt, type FurnitureInput } from '@neftya/engine';
import { HANDLE_SIZE_MM, handleLayout } from './Handles.js';

/**
 * La disposition des poignées.
 *
 * **Ce test naît d'un défaut signalé par un utilisateur.** La poignée de profondeur était
 * posée au centre de la face avant — exactement où tombe le séparateur d'une bibliothèque
 * à deux compartiments. Les deux se superposaient au millimètre près : on n'en voyait
 * qu'une, et tirer dessus déplaçait le séparateur en croyant régler la profondeur.
 *
 * C'est de l'arithmétique. Elle se vérifie sans rien afficher, et rien ne justifiait de
 * l'avoir laissée à l'œil.
 */

const MODELS: [string, FurnitureInput][] = [
  [
    'bibliothèque',
    {
      dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
      compartments: [{ shelves: 1 }, { shelves: 1 }],
    },
  ],
  [
    'meuble TV',
    {
      dimensions: { widthMm: 1600, heightMm: 500, depthMm: 450 },
      compartments: [{ shelves: 1 }, { drawers: 2 }, { shelves: 1 }],
    },
  ],
  [
    'dressing',
    {
      dimensions: { widthMm: 2000, heightMm: 2400, depthMm: 600 },
      compartments: [
        { shelves: 3, doors: 2 },
        { drawers: 3 },
        { shelves: 4, doors: 1 },
      ],
    },
  ],
  [
    'caisson unique',
    {
      dimensions: { widthMm: 400, heightMm: 700, depthMm: 300 },
      compartments: [{ shelves: 2 }],
    },
  ],
  [
    'meuble bas et large',
    {
      dimensions: { widthMm: 3000, heightMm: 300, depthMm: 500 },
      compartments: [{ shelves: 0 }, { shelves: 0 }, { shelves: 0 }, { shelves: 0 }],
    },
  ],
];

const distance = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(...a.map((value, axis) => value - (b[axis] as number)));

describe('deux poignées ne se recouvrent jamais', () => {
  it.each(MODELS)('%s', (_name, input) => {
    const handles = handleLayout(build(input));
    const collisions: string[] = [];

    for (let i = 0; i < handles.length; i += 1) {
      for (let j = i + 1; j < handles.length; j += 1) {
        const gap = distance(
          handles[i]?.atMm as number[],
          handles[j]?.atMm as number[],
        );

        // Deux poignées plus proches que leur propre taille se lisent comme une seule.
        if (gap < HANDLE_SIZE_MM) {
          collisions.push(
            `${handles[i]?.divider ?? handles[i]?.dimension} / ${
              handles[j]?.divider ?? handles[j]?.dimension
            } à ${Math.round(gap)} mm`,
          );
        }
      }
    }

    expect(collisions).toEqual([]);
  });
});

describe('ce que la disposition promet', () => {
  it('donne une poignée par cote, et une par séparateur', () => {
    for (const [, input] of MODELS) {
      const furniture = build(input);
      const handles = handleLayout(furniture);
      const dividers = furniture.parts
        .filter((part) => part.role === 'divider')
        .reduce((total, part) => total + part.quantity, 0);

      expect(handles.filter((handle) => handle.divider === null)).toHaveLength(3);
      expect(handles.filter((handle) => handle.divider !== null)).toHaveLength(
        dividers,
      );
    }
  });

  it('pose la largeur et la hauteur hors du meuble', () => {
    for (const [, input] of MODELS) {
      const { widthMm, heightMm } = input.dimensions;
      const handles = handleLayout(build(input));
      const beyond = { widthMm: [0, widthMm], heightMm: [1, heightMm] } as const;

      for (const handle of handles) {
        const limit = handle.dimension && beyond[handle.dimension as 'widthMm'];
        if (!limit) continue;

        // À fleur, la poignée est à moitié dans le panneau : on croit viser le meuble et
        // on tire la cote, ou l'inverse.
        expect(handle.atMm[limit[0]]).toBeGreaterThan(limit[1]);
      }
    }
  });

  it('pose la profondeur et les séparateurs **devant** le meuble', () => {
    // **Le défaut signalé.** L'avant est le z **minimal** : les portes et les façades de
    // tiroir sont à −18 mm, le fond du caisson au z le plus grand. Les poser du côté de la
    // profondeur les mettait derrière le meuble, là où on ne les cherche pas et où le
    // caisson les masque dès qu'on tourne autour.
    for (const [, input] of MODELS) {
      const furniture = build(input);
      const frontMm = Math.min(
        ...furniture.parts.flatMap((part) =>
          part.instances.map((placement) => placement.zMm),
        ),
      );

      for (const handle of handleLayout(furniture)) {
        if (handle.dimension === 'widthMm' || handle.dimension === 'heightMm') continue;

        expect(handle.atMm[2]).toBeLessThan(frontMm);
      }
    }
  });

  it('aligne chaque poignée de séparateur sur son compartiment', () => {
    // Le rang de la poignée doit désigner le séparateur qu'on voit : décalé d'un, tirer
    // celle du milieu élargirait le mauvais compartiment.
    for (const [, input] of MODELS) {
      const furniture = build(input);

      for (const handle of handleLayout(furniture)) {
        if (handle.divider === null) continue;

        // Juste à gauche du séparateur : le compartiment de son rang.
        expect(compartmentAt(furniture, handle.atMm[0] - 1)).toBe(handle.divider);
        expect(compartmentAt(furniture, handle.atMm[0] + 1)).toBe(handle.divider + 1);
      }
    }
  });
});
