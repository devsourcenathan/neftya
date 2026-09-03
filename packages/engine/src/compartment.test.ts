import { describe, it, expect } from 'vitest';
import { build } from './build.js';
import type { FurnitureInput } from './input.js';

/**
 * De quel compartiment vient une instance.
 *
 * C'est ce qui permet à l'interface de remonter d'une pièce cliquée au paramètre qui l'a
 * produite — sans quoi un menu contextuel ne saurait pas quelle étagère retirer.
 *
 * Le piège est le regroupement : deux compartiments de même largeur avec une étagère
 * chacun produisent la **même** `Part` en quantité 2. Porter le compartiment sur la pièce
 * ferait donc désigner un compartiment sur deux, au hasard de l'ordre de construction.
 *
 * @see docs/NEFTYA_ENGINE.md §3
 */

/** Trois compartiments égaux : les pièces se regroupent au maximum. */
const EVEN: FurnitureInput = {
  dimensions: { widthMm: 1800, heightMm: 2000, depthMm: 400 },
  compartments: [
    { shelves: 2, drawers: 0, doors: 0 },
    { shelves: 2, drawers: 0, doors: 0 },
    { shelves: 2, drawers: 0, doors: 0 },
  ],
};

/** Des contenus différents dans chaque compartiment. */
const MIXED: FurnitureInput = {
  dimensions: { widthMm: 2000, heightMm: 2200, depthMm: 600 },
  compartments: [
    { shelves: 3, drawers: 0, doors: 1 },
    { shelves: 0, drawers: 3, doors: 0 },
    { shelves: 1, drawers: 1, doors: 2 },
  ],
};

const instancesOf = (input: FurnitureInput) =>
  build(input).parts.flatMap((part) =>
    part.instances.map((placement) => ({ role: part.role, placement })),
  );

describe('le compartiment d’une instance', () => {
  it('distingue des instances que la pièce regroupe', () => {
    const furniture = build(EVEN);
    const shelf = furniture.parts.find((part) => part.role === 'shelf');

    // Une seule pièce, six instances : trois compartiments égaux, deux étagères chacun.
    expect(shelf?.quantity).toBe(6);
    expect(new Set(shelf?.instances.map((placement) => placement.compartment))).toEqual(
      new Set([0, 1, 2]),
    );
  });

  it('n’en donne pas à ce qui n’appartient à aucun', () => {
    // Un séparateur est **entre** deux compartiments ; l'enveloppe les contient tous.
    const orphans = ['top', 'bottom', 'side', 'divider', 'back'];

    for (const { role, placement } of instancesOf(MIXED)) {
      if (!orphans.includes(role)) continue;

      expect(placement.compartment).toBeUndefined();
    }
  });

  it('en donne un à tout ce qui vit dans un compartiment', () => {
    const inside = [
      'shelf',
      'door',
      'drawer_face',
      'drawer_side',
      'drawer_front_panel',
      'drawer_back_panel',
      'drawer_bottom',
    ];

    for (const { role, placement } of instancesOf(MIXED)) {
      if (!inside.includes(role)) continue;

      expect(placement.compartment).toBeTypeOf('number');
    }
  });

  it('compte pour chaque compartiment ce que le modèle y a demandé', () => {
    const instances = instancesOf(MIXED);

    const countIn = (index: number, role: string) =>
      instances.filter(
        (entry) => entry.role === role && entry.placement.compartment === index,
      ).length;

    // Le contrôle qui compte : si le marquage se décalait d'un rang, ces neuf nombres
    // seraient faux ensemble, et rien d'autre dans le moteur ne s'en apercevrait.
    MIXED.compartments.forEach((compartment, index) => {
      expect(countIn(index, 'shelf')).toBe(compartment.shelves ?? 0);
      expect(countIn(index, 'door')).toBe(compartment.doors ?? 0);
      expect(countIn(index, 'drawer_face')).toBe(compartment.drawers ?? 0);
    });
  });

  it('reste cohérent quand l’ordre des compartiments change', () => {
    // Un menu contextuel qui dupliquerait ou déplacerait un compartiment doit retrouver
    // le bon : le marquage suit le modèle, il n'est pas figé à la construction.
    const reversed = build({
      ...MIXED,
      compartments: [...MIXED.compartments].reverse(),
    });

    const drawersIn = (index: number) =>
      reversed.parts
        .filter((part) => part.role === 'drawer_face')
        .flatMap((part) => part.instances)
        .filter((placement) => placement.compartment === index).length;

    // Le compartiment à trois tiroirs était au rang 1 ; renversé, il est au rang 1 aussi
    // — trois compartiments, celui du milieu ne bouge pas. Celui à un tiroir passe de 2 à 0.
    expect(drawersIn(1)).toBe(3);
    expect(drawersIn(0)).toBe(1);
  });
});
