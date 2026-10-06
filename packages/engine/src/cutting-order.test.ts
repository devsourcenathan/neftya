import { describe, it, expect } from 'vitest';
import { build } from './build.js';
import { nest } from './nesting.js';
import { cuttingOrder, STORE_MIN_CUT_MM } from './cutting-order.js';
import type { FurnitureInput } from './input.js';

/**
 * La fiche de débit du magasin.
 *
 * Elle n'invente rien : elle regroupe et elle présente. Ce qui est testé ici, c'est
 * précisément ce qu'une présentation peut rater — compter deux fois, perdre une pièce,
 * fondre deux cotes qui ne se commandent pas pareil.
 */

/** Le meuble de référence : 1800 × 600 × 400, deux compartiments, MDF. */
const REFERENCE: FurnitureInput = {
  dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
  compartments: [
    { shelves: 1, drawers: 0 },
    { shelves: 1, drawers: 0 },
  ],
  material: 'mdf',
  hasBack: true,
};

const orderOf = (input: FurnitureInput) => {
  const furniture = build(input);
  return { furniture, order: cuttingOrder(furniture, nest(furniture)) };
};

/**
 * Un meuble qui ne tient pas sur un panneau.
 *
 * Le meuble de référence consomme exactement un panneau par épaisseur : une fiche qui
 * annoncerait « un panneau » sans jamais compter y paraîtrait juste. Il en faut donc un
 * qui en demande plusieurs de la même épaisseur, sans quoi le décompte n'est pas testé.
 */
const LARGE: FurnitureInput = {
  dimensions: { widthMm: 2400, heightMm: 2200, depthMm: 500 },
  compartments: [
    { shelves: 4, drawers: 0, doors: 2 },
    { shelves: 4, drawers: 0, doors: 2 },
    { shelves: 4, drawers: 0, doors: 2 },
  ],
  material: 'mdf',
  hasBack: true,
};

describe('la fiche de débit', () => {
  it('commande autant de panneaux que le placement en consomme', () => {
    const furniture = build(LARGE);
    const nesting = nest(furniture);
    const order = cuttingOrder(furniture, nesting);

    for (const group of order.groups) {
      const used = nesting.panels.filter(
        (panel) =>
          panel.material === group.material && panel.thicknessMm === group.thicknessMm,
      ).length;

      expect(group.panels).toBe(used);
    }

    // Et aucun groupe ne manque : chaque panneau posé a sa ligne de commande.
    expect(order.groups.reduce((total, group) => total + group.panels, 0)).toBe(
      nesting.panels.length,
    );
  });

  it('demande le panneau tel qu’il est vendu, pas tel qu’il est déligné', () => {
    const furniture = build(REFERENCE);
    const nesting = nest(furniture);
    const order = cuttingOrder(furniture, nesting);

    const thick = order.groups.find((group) => group.thicknessMm === 18);
    const panel = nesting.panels.find((candidate) => candidate.thicknessMm === 18);

    expect(thick?.format).toEqual(panel?.format);
    // Le format utile est plus petit : c'est celui du placement, jamais celui du rayon.
    expect(panel?.usableFormat.lengthMm).toBeLessThan(panel?.format.lengthMm ?? 0);
  });

  it('réunit sur une ligne les pièces de mêmes cotes, quel que soit leur rôle', () => {
    const { furniture, order } = orderOf(REFERENCE);

    for (const group of order.groups) {
      const seen = new Set<string>();

      for (const piece of group.pieces) {
        const key = `${piece.lengthMm}x${piece.widthMm}x${String(piece.grainLocked)}`;
        expect(seen.has(key), `${key} dicté deux fois au comptoir`).toBe(false);
        seen.add(key);
      }
    }

    // Les deux étagères et les deux côtés du meuble de référence : regroupés, les morceaux
    // restent en nombre égal à ce que le meuble demande.
    const ordered = order.totalPieces;
    const expected = furniture.parts.reduce((total, part) => total + part.quantity, 0);

    expect(ordered).toBe(expected);
  });

  it('garde les repères des pièces réunies', () => {
    const { furniture, order } = orderOf(REFERENCE);

    const ids = order.groups.flatMap((group) =>
      group.pieces.flatMap((piece) => [...piece.ids]),
    );

    expect([...ids].sort()).toEqual(furniture.parts.map((part) => part.id).sort());
  });

  it('ne bloque le fil que si le projet le demande', () => {
    // Sur un mélaminé uni — `respectGrain` faux — rien n'est bloqué : le comptoir garde le
    // droit de pivoter, et la chute avec. C'est la même condition que le placement.
    const free = orderOf(REFERENCE).order;
    const locked = orderOf({ ...REFERENCE, respectGrain: true }).order;

    expect(
      free.groups.flatMap((group) => group.pieces).some((piece) => piece.grainLocked),
    ).toBe(false);

    expect(
      locked.groups.flatMap((group) => group.pieces).some((piece) => piece.grainLocked),
    ).toBe(true);
  });

  it('tient une ligne pour bloquée dès qu’une de ses pièces l’est', () => {
    // Le cumul penche du côté sûr. Une ligne libre à tort ferait pivoter au comptoir une
    // façade de décor bois : le meuble se voit raté à trois mètres, et aucune finition ne
    // le rattrape. Une ligne bloquée à tort ne coûte que de la chute, au magasin.
    const { furniture, order } = orderOf({ ...REFERENCE, respectGrain: true });

    for (const group of order.groups) {
      for (const piece of group.pieces) {
        const members = furniture.parts.filter((part) => piece.ids.includes(part.id));
        const anyLocked = members.some((part) => part.grain !== 'none');

        expect(piece.grainLocked).toBe(anyLocked);
      }
    }
  });

  it('annonce la plus grande cote en premier', () => {
    const { furniture, order } = orderOf(REFERENCE);

    // C'est le moteur qui le garantit — « cotes de découpe : la plus grande dimension du
    // panneau d'abord ». La fiche s'y appuie au lieu de les retrier, et ce test est ce qui
    // rend cet appui légitime : le jour où une `Part` sortirait dans l'autre ordre, c'est
    // ici que ça tombe, pas au comptoir.
    for (const part of furniture.parts) {
      expect(part.lengthMm).toBeGreaterThanOrEqual(part.widthMm);
    }

    for (const group of order.groups) {
      for (const piece of group.pieces) {
        expect(piece.lengthMm).toBeGreaterThanOrEqual(piece.widthMm);
      }
    }
  });

  it('donne les grandes coupes en premier', () => {
    const { order } = orderOf(REFERENCE);

    for (const group of order.groups) {
      const lengths = group.pieces.map((piece) => piece.lengthMm);
      expect(lengths).toEqual([...lengths].sort((a, b) => b - a));
    }
  });

  it('rend la plus petite cote de toute la commande', () => {
    const { order } = orderOf(REFERENCE);

    const sides = order.groups.flatMap((group) =>
      group.pieces.flatMap((piece) => [piece.lengthMm, piece.widthMm]),
    );

    expect(order.smallestSideMm).toBe(Math.min(...sides));
    // Sur un meuble de cette taille, rien ne descend sous le refus d'une enseigne.
    expect(order.smallestSideMm).toBeGreaterThanOrEqual(STORE_MIN_CUT_MM);
  });

  it('ne commande pas une pièce qu’aucun panneau ne reçoit', () => {
    // Un meuble plus long que le plus grand panneau : `nest` rend la pièce dans
    // `unplaced`. La commander produirait une fiche qu'aucun rayon ne peut honorer.
    const furniture = build({
      ...REFERENCE,
      dimensions: { widthMm: 3600, heightMm: 600, depthMm: 400 },
    });
    const nesting = nest(furniture);
    const order = cuttingOrder(furniture, nesting);

    expect(nesting.unplaced.length).toBeGreaterThan(0);

    const ordered = new Set(
      order.groups.flatMap((group) => group.pieces.flatMap((piece) => [...piece.ids])),
    );

    for (const id of nesting.unplaced) expect(ordered.has(id)).toBe(false);
  });
});
