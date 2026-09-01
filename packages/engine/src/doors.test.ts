import { describe, it, expect } from 'vitest';
import { build } from './build.js';
import type { FurnitureInput } from './input.js';
import { billOfMaterials } from './bill-of-materials.js';
import { nest } from './nesting.js';
import { assemblySteps } from './assembly.js';

/**
 * Les portes.
 *
 * Une porte est **en applique** : elle recouvre le devant du caisson et pave le même plan
 * que les façades de tiroir. C'est ce qui permet à un compartiment de porter les deux sans
 * qu'ils se chevauchent.
 *
 * @see docs/NEFTYA_ENGINE.md §7.2
 */

const DRESSING: FurnitureInput = {
  dimensions: { widthMm: 1000, heightMm: 2000, depthMm: 600 },
  compartments: [{ shelves: 2, drawers: 0, doors: 2 }],
};

function doorsOf(input: FurnitureInput) {
  return build(input).parts.filter((part) => part.role === 'door');
}

describe('vantaux', () => {
  it('produit une paire de vantaux égaux', () => {
    const doors = doorsOf(DRESSING);

    // Une seule pièce en quantité 2 : les deux vantaux sont identiques, donc groupés.
    expect(doors).toHaveLength(1);
    expect(doors[0]?.quantity).toBe(2);
  });

  it('donne aux deux vantaux exactement la même largeur', () => {
    // 1 mm d'écart est invisible sur une étagère et voyant entre deux portes qu'on
    // regarde de face toute la journée. Le jeu central absorbe l'impair.
    for (const widthMm of [1000, 1001, 1234, 1999]) {
      const doors = doorsOf({
        dimensions: { widthMm, heightMm: 2000, depthMm: 600 },
        compartments: [{ shelves: 0, drawers: 0, doors: 2 }],
      });

      expect(doors).toHaveLength(1);
      expect(doors[0]?.quantity).toBe(2);
    }
  });

  it('aligne chaque vantail sur son bord, et laisse le jeu au milieu', () => {
    const [door] = doorsOf(DRESSING);
    const [left, right] = door?.instances ?? [];

    expect(left?.xMm).toBe(0);
    expect((right?.xMm ?? 0) + (right?.sizeXMm ?? 0)).toBe(1000);

    // Le jeu central vaut au moins le jeu nominal, jamais moins.
    const gap = (right?.xMm ?? 0) - ((left?.xMm ?? 0) + (left?.sizeXMm ?? 0));
    expect(gap).toBeGreaterThanOrEqual(3);
    expect(gap).toBeLessThanOrEqual(4);
  });

  it('couvre toute la hauteur quand le compartiment n’a pas de tiroir', () => {
    const [door] = doorsOf(DRESSING);

    expect(Math.max(door?.lengthMm ?? 0, door?.widthMm ?? 0)).toBe(2000);
  });

  it('se pose en avant du caisson, comme une façade de tiroir', () => {
    const [door] = doorsOf(DRESSING);

    // Encastrée à fleur, elle demanderait un caisson d'équerre au dixième — ce qu'on
    // n'obtient pas d'un panneau scié.
    expect(door?.instances[0]?.zMm).toBeLessThan(0);
  });
});

describe('tiroirs et portes dans le même compartiment', () => {
  const BUFFET: FurnitureInput = {
    dimensions: { widthMm: 800, heightMm: 900, depthMm: 450 },
    compartments: [{ shelves: 1, drawers: 2, doors: 1 }],
  };

  it('partage la hauteur de façade sans chevauchement', () => {
    const furniture = build(BUFFET);
    const facade = furniture.parts
      .filter((part) => part.role === 'door' || part.role === 'drawer_face')
      .flatMap((part) => part.instances)
      .map((placement) => ({
        fromMm: placement.yMm,
        toMm: placement.yMm + placement.sizeYMm,
      }))
      .sort((a, b) => a.fromMm - b.fromMm);

    expect(facade).toHaveLength(3);

    for (const [index, row] of facade.entries()) {
      if (index === 0) continue;
      // Chaque rangée commence après la précédente, séparée d'au moins le jeu de façade.
      expect(row.fromMm).toBeGreaterThanOrEqual(facade[index - 1]?.toMm ?? 0);
    }
  });

  it('recompose la hauteur : deux tiroirs, une porte, deux jeux', () => {
    const furniture = build(BUFFET);
    const rows = furniture.parts
      .filter((part) => part.role === 'door' || part.role === 'drawer_face')
      .flatMap((part) => part.instances)
      .map((placement) => placement.sizeYMm);

    expect(rows.reduce((total, height) => total + height, 0) + 2 * 3).toBe(900);
  });

  it('met la porte au-dessus des tiroirs', () => {
    // Convention V1 : c'est l'arrangement d'un dressing à socle de tiroirs.
    const furniture = build(BUFFET);
    const door = furniture.parts.find((part) => part.role === 'door');
    const faces = furniture.parts.find((part) => part.role === 'drawer_face');

    const highestFace = Math.max(
      ...(faces?.instances.map((placement) => placement.yMm) ?? [0]),
    );

    expect(door?.instances[0]?.yMm).toBeGreaterThan(highestFace);
  });

  it('confine les caissons de tiroir sous la porte', () => {
    const furniture = build(BUFFET);
    const door = furniture.parts.find((part) => part.role === 'door');
    const doorBottom = door?.instances[0]?.yMm ?? 0;

    for (const part of furniture.parts.filter((candidate) =>
      candidate.role.startsWith('drawer_'),
    )) {
      if (part.role === 'drawer_face') continue;

      for (const placement of part.instances) {
        // Un caisson qui dépasserait derrière la porte l'empêcherait de fermer.
        expect(placement.yMm + placement.sizeYMm).toBeLessThanOrEqual(doorBottom);
      }
    }
  });
});

describe('avertissements', () => {
  it('signale un vantail trop large plutôt que de le refuser', () => {
    const furniture = build({
      dimensions: { widthMm: 1400, heightMm: 2000, depthMm: 600 },
      compartments: [{ shelves: 0, drawers: 0, doors: 1 }],
    });

    // Le moteur ne décide pas à la place du menuisier : il produit la pièce et le dit.
    expect(furniture.warnings.map((warning) => warning.code)).toContain(
      'DOOR_LEAF_TOO_WIDE',
    );
    expect(furniture.parts.some((part) => part.role === 'door')).toBe(true);
  });

  it('ne signale rien quand une paire ramène chaque vantail sous la limite', () => {
    // 1000 mm en deux vantaux : 498 chacun, sous les 600 admis. La même largeur en un
    // seul vantail serait signalée.
    const furniture = build({
      dimensions: { widthMm: 1000, heightMm: 2000, depthMm: 600 },
      compartments: [{ shelves: 0, drawers: 0, doors: 2 }],
    });

    expect(furniture.warnings.map((warning) => warning.code)).not.toContain(
      'DOOR_LEAF_TOO_WIDE',
    );
  });

  it('ne produit aucune pièce quand le vantail n’a pas de place', () => {
    // Quatre-vingts tiroirs et une porte dans 200 mm : les jeux à eux seuls dépassent la
    // hauteur du meuble, et il n'y a pas de façade à partager.
    const furniture = build({
      dimensions: { widthMm: 600, heightMm: 200, depthMm: 300 },
      compartments: [{ shelves: 0, drawers: 80, doors: 1 }],
    });

    const doors = furniture.parts.filter((part) => part.role === 'door');
    const warned = furniture.warnings.map((warning) => warning.code);

    // Une cote négative dans une liste de découpe est un plan faux.
    expect(doors).toHaveLength(0);
    expect(warned).toContain('DOOR_DOES_NOT_FIT');
  });
});

describe('quincaillerie et montage', () => {
  const hingesFor = (input: FurnitureInput) => {
    const furniture = build(input);
    const bill = billOfMaterials(furniture, nest(furniture));

    return bill.accessories.find((line) => line.key === 'hinge')?.quantity ?? 0;
  };

  it.each([
    [700, 2],
    [900, 2],
    [1200, 3],
    [1800, 4],
    [2400, 5],
  ])('un vantail de %i mm demande %i charnières', (heightMm, expected) => {
    // Deux charnières tiennent une porte basse ; une porte de dressing qui n'en aurait
    // que deux s'affaisse et finit par frotter.
    expect(
      hingesFor({
        dimensions: { widthMm: 500, heightMm, depthMm: 400 },
        compartments: [{ shelves: 0, drawers: 0, doors: 1 }],
      }),
    ).toBe(expected);
  });

  it('compte les charnières de chaque vantail', () => {
    // Deux vantaux de 2000 mm : quatre charnières chacun.
    expect(hingesFor(DRESSING)).toBe(8);
  });

  it('n’ajoute aucune charnière à un meuble sans porte', () => {
    expect(
      hingesFor({
        dimensions: { widthMm: 800, heightMm: 800, depthMm: 400 },
        compartments: [{ shelves: 1, drawers: 0 }],
      }),
    ).toBe(0);
  });

  it('pose les portes à la dernière étape du montage', () => {
    const steps = assemblySteps(build(DRESSING)).map((step) => step.key);

    // Elles se règlent une fois tout le reste en place : un caisson qu'on manipule
    // encore dérègle ce qu'on vient d'ajuster.
    expect(steps.at(-1)).toBe('doors');
  });
});

describe('placement sur panneau', () => {
  it('place les vantaux comme n’importe quelle pièce', () => {
    const furniture = build(DRESSING);
    const result = nest(furniture);

    const placed = result.panels
      .flatMap((panel) => panel.placements)
      .filter((placement) =>
        furniture.parts.some(
          (part) => part.id === placement.partId && part.role === 'door',
        ),
      );

    expect(placed).toHaveLength(2);
    expect(result.unplaced).toEqual([]);
  });
});
