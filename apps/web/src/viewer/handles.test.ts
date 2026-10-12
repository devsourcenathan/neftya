import { describe, it, expect } from 'vitest';
import { build, compartmentAt, type FurnitureInput } from '@neftya/engine';
import { handleLayout, type HandleSpec } from './Handles.js';

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
 *
 * **Et ce test a menti.** Il comparait la distance entre deux centres à une seule valeur
 * de 60 mm, comme si toutes les poignées étaient des cubes de 60 — alors qu'une barre de
 * séparateur fait 240 mm de haut. Sur le « meuble bas et large », qui était déjà dans
 * cette liste, le bouton de profondeur et la barre centrale sont distants de 96 mm et se
 * chevauchent sur toute leur épaisseur : le test passait au vert pendant qu'un
 * utilisateur voyait les deux superposés à l'écran.
 *
 * Il mesure désormais le recouvrement de volumes réels, avec l'encombrement que le rendu
 * utilise. Une taille supposée est une mesure qu'on n'a pas faite.
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
  [
    /*
     * **Le cas signalé.** Un banc au plus bas de ce que le produit accepte, avec un
     * nombre pair de compartiments — donc un séparateur exactement à mi-largeur, là où
     * se posait le bouton de profondeur.
     */
    'banc, à la hauteur minimale',
    {
      dimensions: { widthMm: 2400, heightMm: 200, depthMm: 450 },
      compartments: [{ shelves: 0 }, { shelves: 0 }],
    },
  ],
];

const name = (handle: HandleSpec) =>
  handle.divider === null
    ? (handle.dimension as string)
    : `séparateur ${handle.divider}`;

/** Deux volumes alignés sur les axes se touchent-ils ? Sur les trois axes à la fois. */
const overlaps = (a: HandleSpec, b: HandleSpec) =>
  [0, 1, 2].every((axis) => {
    const gap = Math.abs((a.atMm[axis] as number) - (b.atMm[axis] as number));

    return gap < ((a.sizeMm[axis] as number) + (b.sizeMm[axis] as number)) / 2;
  });

describe('deux poignées ne se recouvrent jamais', () => {
  it.each(MODELS)('%s', (_name, input) => {
    const handles = handleLayout(build(input));
    const collisions: string[] = [];

    for (let i = 0; i < handles.length; i += 1) {
      for (let j = i + 1; j < handles.length; j += 1) {
        const a = handles[i] as HandleSpec;
        const b = handles[j] as HandleSpec;

        // Deux poignées qui se recouvrent se lisent comme une seule, et celle qu'on
        // saisit n'est pas celle qu'on croit.
        if (overlaps(a, b)) collisions.push(`${name(a)} / ${name(b)}`);
      }
    }

    expect(collisions).toEqual([]);
  });
});

describe('une barre de séparateur tient dans son meuble', () => {
  it.each(MODELS)('%s', (_name, input) => {
    /*
     * Une barre de 240 mm sur un meuble de 200 mm dépassait en haut et en bas.
     *
     * Ce n'est pas qu'une question d'allure : une commande qui sort du caisson se lit
     * comme une pièce du meuble, et on cherche à la visser au lieu de la tirer.
     */
    const { heightMm } = input.dimensions;

    for (const handle of handleLayout(build(input))) {
      if (handle.divider === null) continue;

      expect(handle.atMm[1] - handle.sizeMm[1] / 2).toBeGreaterThanOrEqual(0);
      expect(handle.atMm[1] + handle.sizeMm[1] / 2).toBeLessThanOrEqual(heightMm);
    }
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
