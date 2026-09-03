import { describe, it, expect } from 'vitest';
import { build } from './build.js';
import type { FurnitureInput } from './input.js';
import { drilling } from './drilling.js';
import { facadesOf, hingeEdgeOf } from './facades.js';
import { pulls, suggestedPull } from './pulls.js';
import { PULL_CENTRES_MM } from './hardware.js';

/**
 * Les poignées de meuble.
 *
 * **La première donnée du modèle qui ne se déduise de rien.** Une étagère existe parce
 * qu'on a demandé trois étagères ; une poignée existe parce que quelqu'un l'a posée là.
 * Elle se saisit, se déplace et se supprime — et c'est pourquoi elle a besoin de tests
 * d'un autre genre : il ne s'agit plus de vérifier un calcul mais de vérifier qu'une
 * saisie survit à ce qui l'entoure.
 *
 * Le test qui compte est le premier : **une poignée du côté des charnières empêche la
 * porte de s'ouvrir**. Aucun défaut ne doit produire ça.
 *
 * @see docs/NEFTYA_ENGINE.md §13
 */

const SIDEBOARD: FurnitureInput = {
  dimensions: { widthMm: 1600, heightMm: 900, depthMm: 450 },
  compartments: [
    { shelves: 1, doors: 1, pulls: [{ target: 'door', slot: 0, key: 'pull_bar_128' }] },
    {
      drawers: 2,
      pulls: [
        { target: 'drawer', slot: 0, key: 'pull_bar_160' },
        { target: 'drawer', slot: 1, key: 'pull_shell' },
      ],
    },
  ],
};

/** Une paire de vantaux : les deux poignées doivent se retrouver au centre. */
const WARDROBE: FurnitureInput = {
  dimensions: { widthMm: 1200, heightMm: 2000, depthMm: 600 },
  compartments: [
    {
      shelves: 2,
      doors: 2,
      pulls: [
        { target: 'door', slot: 0, key: 'pull_knob' },
        { target: 'door', slot: 1, key: 'pull_knob' },
      ],
    },
  ],
};

describe('la poignée d’un vantail', () => {
  it('se pose du côté qui s’ouvre, jamais du côté charnière', () => {
    for (const input of [SIDEBOARD, WARDROBE]) {
      const furniture = build(input);

      for (const pull of pulls(furniture).pulls) {
        if (pull.target !== 'door') continue;

        const facade = facadesOf(furniture).find(
          (candidate) =>
            candidate.role === 'door' &&
            candidate.compartment === pull.compartment &&
            candidate.slot === pull.slot,
        );
        const hinge = hingeEdgeOf(furniture, facade!.placement);
        const middle = facade!.placement.sizeXMm / 2;

        // Une poignée du côté des charnières empêche la porte de s'ouvrir : la main est
        // du mauvais côté du pivot.
        if (hinge === 'left') expect(pull.onFacadeMm.xMm).toBeGreaterThan(middle);
        if (hinge === 'right') expect(pull.onFacadeMm.xMm).toBeLessThan(middle);
      }
    }
  });

  it('met les deux poignées d’une paire de part et d’autre du jeu central', () => {
    const furniture = build(WARDROBE);
    const doorPulls = pulls(furniture)
      .pulls.filter((pull) => pull.target === 'door')
      .sort((a, b) => a.atMm.xMm - b.atMm.xMm);

    expect(doorPulls).toHaveLength(2);

    const centre = WARDROBE.dimensions.widthMm / 2;
    // Le vantail gauche charnière à gauche, le droit à droite : les deux poignées se
    // rejoignent au milieu, ce qui est le geste des deux mains.
    expect(doorPulls[0]?.atMm.xMm).toBeLessThan(centre);
    expect(doorPulls[1]?.atMm.xMm).toBeGreaterThan(centre);
    expect(centre - (doorPulls[0]?.atMm.xMm as number)).toBeLessThan(200);
  });

  it('est verticale sur une porte, horizontale sur un tiroir', () => {
    // Le geste, pas l'esthétique : on ouvre une porte de haut en bas, on tire un tiroir à
    // deux doigts.
    for (const pull of pulls(build(SIDEBOARD)).pulls) {
      expect(pull.orientation).toBe(pull.target === 'door' ? 'vertical' : 'horizontal');
    }
  });
});

describe('la position saisie', () => {
  it('l’emporte sur le calcul', () => {
    const moved = build({
      ...SIDEBOARD,
      compartments: [
        {
          ...SIDEBOARD.compartments[0],
          pulls: [{ target: 'door', slot: 0, key: 'pull_bar_128', xMm: 60, yMm: 700 }],
        },
        SIDEBOARD.compartments[1] as never,
      ],
    });

    const pull = pulls(moved).pulls[0];

    expect(pull?.onFacadeMm).toEqual({ xMm: 60, yMm: 700 });
  });

  it('signale une poignée qui dépasse de sa façade', () => {
    const off = build({
      dimensions: { widthMm: 600, heightMm: 700, depthMm: 400 },
      compartments: [
        {
          doors: 1,
          pulls: [{ target: 'door', slot: 0, key: 'pull_bar_192', xMm: 10, yMm: 350 }],
        },
      ],
    });

    // Une barre dont le pied arrive à trois millimètres du bord « tient » sur la façade
    // et fend le panneau à la première vis. Le signaler vaut mieux que de la recentrer en
    // douce, ce qui ferait mentir la cote saisie.
    expect(pulls(off).warnings.map((warning) => warning.code)).toContain(
      'PULL_OFF_FACADE',
    );
  });
});

describe('ce que le moteur refuse de deviner', () => {
  it('signale une poignée sans façade', () => {
    // La porte a été retirée depuis. La poignée n'est pas reportée sur la voisine.
    const orphan = build({
      dimensions: { widthMm: 800, heightMm: 700, depthMm: 400 },
      compartments: [
        {
          shelves: 1,
          doors: 0,
          pulls: [{ target: 'door', slot: 0, key: 'pull_knob' }],
        },
      ],
    });
    const result = pulls(orphan);

    expect(result.pulls).toHaveLength(0);
    expect(result.warnings.map((warning) => warning.code)).toContain(
      'PULL_WITHOUT_FACADE',
    );
  });

  it('ouvre quand même un projet dont la référence a disparu du catalogue', () => {
    const stale = build({
      dimensions: { widthMm: 800, heightMm: 700, depthMm: 400 },
      compartments: [
        { doors: 1, pulls: [{ target: 'door', slot: 0, key: 'pull_bar_1789' }] },
      ],
    });
    const result = pulls(stale);

    // Refuser le meuble entier pour une poignée inconnue rendrait un projet enregistré
    // illisible le jour où le catalogue change.
    expect(stale.parts.length).toBeGreaterThan(0);
    expect(result.warnings.map((warning) => warning.code)).toContain('PULL_UNKNOWN');
  });
});

describe('le perçage', () => {
  const drilled = drilling(build(SIDEBOARD));
  const screws = drilled.parts.flatMap((part) =>
    part.holes.filter((hole) => hole.purpose === 'pull_screw'),
  );

  it('traverse la façade, et le dit', () => {
    expect(screws.length).toBeGreaterThan(0);

    for (const screw of screws) {
      // La seule exception du moteur : une vis de poignée doit sortir, sinon la poignée ne
      // tient sur rien. Partout ailleurs, un foret qui déboucherait abîmerait une face
      // qu'on regarde.
      expect(screw.through).toBe(true);
      expect(screw.diameterMm).toBe(4);
    }
  });

  it('se perce depuis l’intérieur de la façade', () => {
    // C'est de là qu'on visse. Et cela met les vis sur le même bloc de DXF que les
    // boîtiers de charnière, qui se fraisent sur la même face.
    for (const screw of screws) expect(screw.side).toBe('back');
  });

  it('respecte l’entraxe au millimètre', () => {
    const barPulls = pulls(build(SIDEBOARD)).pulls.filter(
      (pull) => pull.spec.shape === 'bar',
    );

    expect(barPulls.length).toBeGreaterThan(0);

    for (const pull of barPulls) {
      const onSameFacade = drilled.parts
        .flatMap((part) => part.holes)
        .filter(
          (hole) => hole.purpose === 'pull_screw' && hole.hardware === pull.spec.key,
        );

      expect(onSameFacade).toHaveLength(2);
      const [a, b] = onSameFacade;
      const gap = Math.hypot(
        (a?.xMm as number) - (b?.xMm as number),
        (a?.yMm as number) - (b?.yMm as number),
      );

      // **La cote qui doit tomber juste.** Une barre dont l'entraxe est faux ne se visse
      // pas, quelle que soit sa longueur.
      expect(gap).toBe(pull.spec.centresMm);
      expect(PULL_CENTRES_MM).toContain(
        pull.spec.centresMm as (typeof PULL_CENTRES_MM)[number],
      );
    }
  });

  it('fraise la coquille sur la face visible, sans aucune vis', () => {
    const pockets = drilled.parts.flatMap((part) => part.pockets);

    expect(pockets).toHaveLength(1);
    expect(pockets[0]?.purpose).toBe('pull_shell');
    // Une empreinte s'ouvre du côté qu'on voit : c'est là que la main entre.
    expect(pockets[0]?.side).toBe('front');
    expect(pockets[0]?.depthMm).toBeLessThan(18);

    const shellScrews = screws.filter((screw) => screw.hardware === 'pull_shell');
    expect(shellScrews).toHaveLength(0);
  });
});

describe('le décompte', () => {
  it('compte les trois poignées, coquille comprise', () => {
    const hardware = drilling(build(SIDEBOARD)).hardware;
    const pullLines = hardware.filter((line) => line.key.startsWith('pull_'));

    // **Le piège.** Une coquille n'a pas un seul trou : la compter par ses perçages en
    // aurait oublié une sur trois formes, et l'atelier l'aurait découvert en montant.
    expect(pullLines.map((line) => line.key).sort()).toEqual([
      'pull_bar_128',
      'pull_bar_160',
      'pull_shell',
    ]);
    for (const line of pullLines) expect(line.quantity).toBe(1);
  });

  it('n’en compte aucune sur un meuble sans poignée', () => {
    const bare = build({
      dimensions: { widthMm: 800, heightMm: 700, depthMm: 400 },
      compartments: [{ shelves: 2, doors: 1 }],
    });

    expect(
      drilling(bare).hardware.filter((line) => line.key.startsWith('pull_')),
    ).toHaveLength(0);
  });
});

describe('ce que Neftya propose', () => {
  it('choisit la plus large barre qui tienne sur la façade', () => {
    const furniture = build(SIDEBOARD);

    for (const facade of facadesOf(furniture)) {
      const spec = suggestedPull(facade);
      const alongMm =
        facade.role === 'door' ? facade.placement.sizeYMm : facade.placement.sizeXMm;

      // Une barre qui déborde ne se visse pas : proposer le plus grand entraxe par défaut
      // condamnerait les petites façades.
      expect(spec.lengthMm).toBeLessThanOrEqual(alongMm);
    }
  });

  it('retombe sur un bouton là où aucune barre ne tient', () => {
    const narrow = build({
      dimensions: { widthMm: 140, heightMm: 220, depthMm: 300 },
      compartments: [{ drawers: 1 }],
    });
    const facade = facadesOf(narrow).find((entry) => entry.role === 'drawer_face');

    // Un bouton tient partout : c'est le seul qui ne demande aucun entraxe.
    expect(suggestedPull(facade!).shape).toBe('knob');
  });
});

describe('le moteur reste pur', () => {
  it('rend les mêmes poignées pour la même entrée', () => {
    expect(pulls(build(SIDEBOARD))).toEqual(pulls(build(SIDEBOARD)));
  });

  it('ne touche pas au meuble', () => {
    const furniture = build(SIDEBOARD);
    const before = JSON.stringify(furniture);

    pulls(furniture);

    expect(JSON.stringify(furniture)).toBe(before);
  });
});
