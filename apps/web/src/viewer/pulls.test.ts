import { describe, it, expect } from 'vitest';
import { build, pulls, type FurnitureInput } from '@neftya/engine';
import { pullGeometry, pullId } from './Pulls.js';

/**
 * Le volume qui représente une poignée.
 *
 * **Écrit comme test parce que je n'ai pas pu le voir.** Le canevas d'essai ne compose pas
 * de dimensions utilisables, et la dernière fois que j'ai laissé une position de volume à
 * l'oeil, deux poignées se superposaient au millimètre près — un utilisateur l'a signalé
 * avant moi.
 *
 * Ce qui compte ici n'est pas l'apparence : c'est qu'une barre **saille devant** la façade
 * et qu'une coquille **s'y creuse**. À l'envers, la barre disparaît dans le panneau et la
 * coquille flotte devant.
 */

const SIDEBOARD: FurnitureInput = {
  dimensions: { widthMm: 1800, heightMm: 900, depthMm: 450 },
  compartments: [
    { shelves: 1, doors: 1, pulls: [{ target: 'door', slot: 0, key: 'pull_bar_128' }] },
    {
      drawers: 2,
      pulls: [
        { target: 'drawer', slot: 0, key: 'pull_bar_160' },
        { target: 'drawer', slot: 1, key: 'pull_shell' },
      ],
    },
    { doors: 1, pulls: [{ target: 'door', slot: 0, key: 'pull_knob' }] },
  ],
};

const furniture = build(SIDEBOARD);
const placed = pulls(furniture).pulls;

/** Le z le plus en avant du meuble : les façades, à l'épaisseur d'un panneau devant. */
const frontMm = Math.min(
  ...furniture.parts.flatMap((part) =>
    part.instances.map((placement) => placement.zMm),
  ),
);

describe('la profondeur d’une poignée', () => {
  it('fait saillir barres et boutons devant la façade', () => {
    const outward = placed.filter((pull) => pull.spec.shape !== 'shell');

    expect(outward.length).toBeGreaterThan(0);

    for (const pull of outward) {
      const { atMm, sizeMm } = pullGeometry(pull);
      const nearest = atMm[2] - sizeMm[2] / 2;

      // Le volume entier est devant la façade : à l'envers, la poignée serait noyée dans
      // le panneau et on ne verrait qu'une tache.
      expect(atMm[2]).toBeLessThan(frontMm);
      expect(nearest).toBeLessThan(frontMm);
    }
  });

  it('creuse la coquille dans la façade', () => {
    const shells = placed.filter((pull) => pull.spec.shape === 'shell');

    expect(shells).toHaveLength(1);

    for (const pull of shells) {
      const { atMm, sizeMm } = pullGeometry(pull);

      // Une empreinte rentre : son centre est derrière la face visible, et sa profondeur
      // ne traverse pas le panneau.
      expect(atMm[2]).toBeGreaterThan(frontMm);
      expect(sizeMm[2]).toBeLessThan(18);
    }
  });
});

describe('l’encombrement', () => {
  it('couche la barre d’un tiroir et dresse celle d’une porte', () => {
    for (const pull of placed) {
      const [widthMm, heightMm] = pullGeometry(pull).sizeMm;

      // Le geste, pas l'esthétique : on tire un tiroir à deux doigts, on ouvre une porte
      // de haut en bas.
      if (pull.spec.shape === 'knob') continue;
      if (pull.target === 'drawer') expect(widthMm).toBeGreaterThan(heightMm);
      else expect(heightMm).toBeGreaterThan(widthMm);
    }
  });

  it('donne au bouton la même mesure dans les deux sens', () => {
    const knob = placed.find((pull) => pull.spec.shape === 'knob');
    const [widthMm, heightMm] = pullGeometry(knob!).sizeMm;

    expect(widthMm).toBe(heightMm);
  });
});

describe('l’identité d’une poignée', () => {
  it('distingue deux poignées du même compartiment', () => {
    // Le rang est celui du **modèle**, pas de la liste à plat : sans lui, supprimer la
    // troisième poignée du meuble en retirerait une autre.
    expect(pullId(1, 0)).not.toBe(pullId(1, 1));
    expect(pullId(0, 0)).not.toBe(pullId(1, 0));
  });

  it('en donne une à chaque poignée du meuble', () => {
    const ids = new Set<string>();
    const seen = new Map<number, number>();

    for (const pull of placed) {
      const rank = seen.get(pull.compartment) ?? 0;
      seen.set(pull.compartment, rank + 1);
      ids.add(pullId(pull.compartment, rank));
    }

    expect(ids.size).toBe(placed.length);
  });
});
