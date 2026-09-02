import { describe, it, expect } from 'vitest';
import { build } from './build.js';
import type { FurnitureInput } from './input.js';
import { nest } from './nesting.js';
import { nestingViolations } from './nesting-properties.js';

/**
 * Le sens du fil.
 *
 * Sur un décor bois, le fil de deux pièces voisines doit courir dans le même sens. Une
 * porte pivotée de 90° se voit à trois mètres et aucune finition ne la rattrape ; sur un
 * mélaminé uni, la même rotation ne se voit pas du tout.
 *
 * Le moteur ne peut pas trancher tout seul — il ne sait pas ce qu'il y a sur le panneau —
 * et c'est pourquoi la contrainte est **portée par le projet**, désactivée par défaut.
 *
 * @see docs/NEFTYA_ENGINE.md §8
 * @see docs/MANUFACTURING.md §2
 */

/** Le meuble du §2 de MANUFACTURING.md, où aucune pièce n'est posée pivotée. */
const REFERENCE: FurnitureInput = {
  dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
  compartments: [
    { shelves: 1, drawers: 0, doors: 0 },
    { shelves: 1, drawers: 0, doors: 0 },
  ],
  material: 'mdf',
  hasBack: true,
};

const WARDROBE: FurnitureInput = {
  dimensions: { widthMm: 1400, heightMm: 2000, depthMm: 600 },
  compartments: [
    { shelves: 3, drawers: 2, doors: 2 },
    { shelves: 4, drawers: 0, doors: 1 },
  ],
  material: 'melamine',
  hasBack: true,
};

const rotatedIds = (input: FurnitureInput, respectGrain: boolean) => {
  const furniture = build({ ...input, respectGrain });

  return new Set(
    nest(furniture)
      .panels.flatMap((panel) => panel.placements)
      .filter((placement) => placement.rotated)
      .map((placement) => placement.partId),
  );
};

describe('le fil est porté par la pièce', () => {
  it('court dans la longueur de découpe des pièces visibles', () => {
    // Sur un côté, la longueur est la hauteur ; sur un dessus, la largeur du meuble ; sur
    // un vantail, la hauteur. Dans les trois cas, c'est le sens où doit courir le fil.
    for (const part of build(WARDROBE).parts) {
      const visible = ['top', 'bottom', 'side', 'divider', 'shelf', 'door', 'drawer_face'];

      expect(part.grain).toBe(visible.includes(part.role) ? 'length' : 'none');
    }
  });

  it('laisse libres les pièces qu’on ne voit pas', () => {
    // Un fond de caisson, un fond de tiroir, les flancs d'un caisson de tiroir sont cachés
    // une fois le meuble monté. Leur imposer un sens ne changerait rien à l'oeil et
    // coûterait de la chute à chaque panneau.
    const hidden = build(WARDROBE).parts.filter((part) => part.grain === 'none');

    expect(hidden.map((part) => part.role).sort()).toEqual(
      ['back', 'drawer_back_panel', 'drawer_bottom', 'drawer_front_panel', 'drawer_side'].sort(),
    );
  });
});

describe('placement sous contrainte', () => {
  it('ne pivote aucune pièce visible', () => {
    const furniture = build({ ...WARDROBE, respectGrain: true });
    const grained = new Set(
      furniture.parts.filter((part) => part.grain === 'length').map((part) => part.id),
    );

    for (const panel of nest(furniture).panels) {
      for (const placement of panel.placements) {
        if (!grained.has(placement.partId)) continue;

        expect(placement.rotated).toBe(false);
      }
    }
  });

  it('pivote encore ce qui ne se voit pas', () => {
    // La contrainte est une contrainte de décor, pas de principe : la refuser partout
    // ferait payer de la chute pour un fond de tiroir que personne ne regardera.
    //
    // Le format étroit force la question : chaque pièce doit pivoter ou renoncer. Les
    // cachées pivotent, les visibles sont refusées.
    const furniture = build({
      dimensions: { widthMm: 900, heightMm: 800, depthMm: 500 },
      compartments: [{ shelves: 0, drawers: 3, doors: 0 }],
      hasBack: false,
      respectGrain: true,
    });
    const byId = new Map(furniture.parts.map((part) => [part.id, part]));
    const result = nest(furniture, { formats: [{ lengthMm: 500, widthMm: 3000 }] });

    const rotated = result.panels
      .flatMap((panel) => panel.placements)
      .filter((placement) => placement.rotated);

    expect(rotated.length).toBeGreaterThan(0);
    for (const placement of rotated) {
      expect(byId.get(placement.partId)?.grain).toBe('none');
    }
    // Et une pièce visible qui ne rentre que pivotée est **signalée**, pas pivotée en
    // douce : c'est le menuisier qui décidera de changer de format ou de décor.
    expect(
      result.unplaced.some((id) => byId.get(id)?.grain === 'length'),
    ).toBe(true);
  });

  it('redresse un vantail que le placement libre couchait', () => {
    // Sans contrainte, ce dressing pose un vantail en travers du panneau. Le fil d'une
    // porte de 2 m qui court à l'horizontale se voit à trois mètres, et aucune finition ne
    // le rattrape.
    const furniture = build(WARDROBE);
    const laid = [...rotatedIds(WARDROBE, false)];

    expect(laid.length).toBe(1);
    expect(furniture.parts.find((part) => part.id === laid[0])?.role).toBe('door');
    expect(rotatedIds(WARDROBE, true).size).toBe(0);
  });

  it('reste désactivée par défaut', () => {
    // Le moteur ne sait pas ce qu'il y a sur le panneau. Sur un mélaminé uni, la contrainte
    // ne coûterait que de la chute.
    expect(build(WARDROBE).input.respectGrain).toBe(false);
    expect(rotatedIds(WARDROBE, false).size).toBe(1);
  });
});

describe('le plan reste un plan', () => {
  it.each([
    ['référence', REFERENCE],
    ['dressing', WARDROBE],
  ])('ne viole rien sous contrainte — %s', (_name, input) => {
    const furniture = build({ ...input, respectGrain: true });

    // Guillotine, trait de scie, aucune pièce hors du panneau : la contrainte ne doit rien
    // relâcher de ce que le placement garantissait déjà.
    expect(nestingViolations(furniture, nest(furniture))).toEqual([]);
  });

  it.each([
    ['format courant', undefined],
    // Le format étroit met la contrainte en défaut sur presque toutes les pièces : c'est
    // là que le compte se perd, s'il se perd.
    ['format étroit', [{ lengthMm: 500, widthMm: 3000 }]],
  ])('ne perd aucune pièce en chemin — %s', (_name, formats) => {
    const furniture = build({ ...WARDROBE, respectGrain: true });
    const result = nest(furniture, formats ? { formats } : {});

    const expected = furniture.parts.reduce((total, part) => total + part.quantity, 0);
    const placed = result.panels.reduce(
      (total, panel) => total + panel.placements.length,
      0,
    );

    // Une pièce que la contrainte rend impossible à poser doit être **signalée**, pas
    // perdue : un plan de découpe amputé est un plan faux qui a l'air complet. Le tri
    // préalable et le placement doivent donc juger la rotation de la même façon — l'un
    // déclarant plaçable ce que l'autre refuse, la pièce disparaît sans un mot.
    expect(placed + result.unplaced.length).toBe(expected);
  });

  it('coûte des panneaux, et le dit', () => {
    const free = nest(build({ ...WARDROBE, respectGrain: false }));
    const constrained = nest(build({ ...WARDROBE, respectGrain: true }));

    // Ce n'est pas une régression : c'est le prix d'un décor bois, et il doit être visible
    // avant la commande plutôt que découvert à la livraison.
    expect(constrained.panels.length).toBeGreaterThanOrEqual(free.panels.length);
  });
});
