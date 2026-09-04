import { describe, it, expect } from 'vitest';
import { build } from '@neftya/engine';
import {
  LIMITS,
  PULLS_PER_COMPARTMENT_MAX,
  defaultModel,
  normalise,
  reduce,
  resizeAt,
} from './model.js';

/**
 * Les actions d'un menu contextuel : dupliquer, supprimer, appliquer à tous.
 *
 * Le modèle est **paramétrique** : une pièce est une conséquence, pas un objet. « Supprimer
 * cette étagère » n'est donc pas exprimable — mais « retirer une étagère de ce
 * compartiment » l'est, et c'est aussi ce que dirait un menuisier.
 *
 * @see docs/NEFTYA_ENGINE.md §7.1
 */

const MODEL = defaultModel();

const contents = (model: ReturnType<typeof defaultModel>) =>
  model.compartments.map(
    (compartment) =>
      `${compartment.shelves}/${compartment.drawers}/${compartment.doors}`,
  );

describe('dupliquer un compartiment', () => {
  it('pose la copie juste après l’original', () => {
    const after = reduce(MODEL, { type: 'duplicateCompartment', index: 1 });

    // À la fin, la copie serait à trois modules de l'endroit qu'on regarde.
    expect(contents(after)).toEqual([
      contents(MODEL)[0],
      contents(MODEL)[1],
      contents(MODEL)[1],
      contents(MODEL)[2],
    ]);
  });

  it('copie le contenu, pas la référence', () => {
    const after = reduce(MODEL, { type: 'duplicateCompartment', index: 0 });

    // Défensif, et assumé comme tel : le réducteur est immuable de bout en bout, donc deux
    // compartiments qui partageraient un objet se comporteraient correctement aujourd'hui.
    // La copie ne coûte rien et retire la question — le jour où quelqu'un écrit
    // `compartment.shelves += 1`, les deux changeraient ensemble.
    expect(after.compartments[0]).not.toBe(after.compartments[1]);
    expect(after.compartments[0]).toEqual(after.compartments[1]);
  });

  it('refuse de dépasser le plafond', () => {
    const full = {
      ...MODEL,
      compartments: Array.from({ length: LIMITS.compartments.max }, () => ({
        shelves: 1,
        drawers: 0,
        doors: 0,
        pulls: [],
        shelfSpacesMm: [],
      })),
    };

    expect(reduce(full, { type: 'duplicateCompartment', index: 0 })).toBe(full);
  });

  it('ignore un rang qui n’existe pas', () => {
    expect(reduce(MODEL, { type: 'duplicateCompartment', index: 9 })).toBe(MODEL);
  });
});

describe('supprimer un compartiment', () => {
  it('supprime celui qu’on désigne, pas le dernier', () => {
    // **Le défaut que cette action existe pour corriger.** Réduire le *nombre* de
    // compartiments tronque par la fin : cliquer « supprimer » sur le premier effaçait le
    // dernier, et le meuble changeait sous les yeux de quelqu'un qui visait autre chose.
    const after = reduce(MODEL, { type: 'removeCompartment', index: 0 });

    expect(contents(after)).toEqual(contents(MODEL).slice(1));
  });

  it('garde le dernier compartiment', () => {
    const single = { ...MODEL, compartments: [MODEL.compartments[0]!] };

    // Un meuble sans compartiment n'est plus un meuble : le moteur le refuserait.
    expect(reduce(single, { type: 'removeCompartment', index: 0 })).toBe(single);
  });

  it('ignore un rang qui n’existe pas', () => {
    expect(reduce(MODEL, { type: 'removeCompartment', index: 9 })).toBe(MODEL);
  });
});

describe('appliquer à tous', () => {
  it('propage le contenu sans changer le nombre', () => {
    const after = reduce(MODEL, { type: 'applyToAll', index: 1 });

    expect(after.compartments).toHaveLength(MODEL.compartments.length);
    expect(new Set(contents(after))).toEqual(new Set([contents(MODEL)[1]]));
  });

  it('donne à chacun sa propre copie', () => {
    const after = reduce(MODEL, { type: 'applyToAll', index: 0 });
    const changed = reduce(after, { type: 'doors', index: 2, count: 2 });

    expect(changed.compartments[0]?.doors).toBe(0);
    expect(changed.compartments[2]?.doors).toBe(2);
  });
});

describe('le moteur suit', () => {
  it('construit un meuble valide après chaque action', () => {
    const cases = [
      reduce(MODEL, { type: 'duplicateCompartment', index: 1 }),
      reduce(MODEL, { type: 'removeCompartment', index: 1 }),
      reduce(MODEL, { type: 'applyToAll', index: 1 }),
    ];

    for (const model of cases) {
      const furniture = build(model);

      expect(furniture.parts.length).toBeGreaterThan(0);
      for (const part of furniture.parts) {
        expect(part.lengthMm).toBeGreaterThan(0);
        expect(part.widthMm).toBeGreaterThan(0);
      }
    }
  });

  it('renumérote les compartiments des instances', () => {
    // Après une suppression, le compartiment 2 devient le 1. Un marquage figé à la
    // construction ferait viser le mauvais au coup d'après.
    const after = reduce(MODEL, { type: 'removeCompartment', index: 0 });
    const compartments = build(after)
      .parts.flatMap((part) => part.instances)
      .map((placement) => placement.compartment)
      .filter((index): index is number => index !== undefined);

    expect(Math.max(...compartments)).toBe(after.compartments.length - 1);
  });
});

describe('déplacer un compartiment', () => {
  it('le pose au rang visé, en décalant les autres', () => {
    const after = reduce(MODEL, { type: 'moveCompartment', from: 0, to: 2 });
    const before = contents(MODEL);

    expect(contents(after)).toEqual([before[1], before[2], before[0]]);
  });

  it('ne change rien quand le rang est le même', () => {
    expect(reduce(MODEL, { type: 'moveCompartment', from: 1, to: 1 })).toBe(MODEL);
  });

  it('ignore un rang qui n’existe pas', () => {
    expect(reduce(MODEL, { type: 'moveCompartment', from: 0, to: 9 })).toBe(MODEL);
    expect(reduce(MODEL, { type: 'moveCompartment', from: 9, to: 0 })).toBe(MODEL);
  });

  it('n’en perd ni n’en gagne aucun', () => {
    for (const to of [0, 1, 2]) {
      const after = reduce(MODEL, { type: 'moveCompartment', from: 1, to });

      expect(after.compartments).toHaveLength(MODEL.compartments.length);
      expect(contents(after).sort()).toEqual(contents(MODEL).sort());
    }
  });
});

describe('les largeurs imposées', () => {
  it('s’écrivent toutes d’un coup', () => {
    // Tirer un séparateur change **deux** largeurs. Deux actions feraient deux pas
    // d'historique pour un geste, et le premier Ctrl+Z laisserait le meuble dans un état
    // que personne n'a vu.
    const after = reduce(MODEL, {
      type: 'compartmentWidths',
      widths: [400, 600, undefined],
    });

    expect(after.compartments.map((entry) => entry.widthMm)).toEqual([
      400,
      600,
      undefined,
    ]);
  });

  it('rendent un compartiment souple quand on les retire', () => {
    const fixed = reduce(MODEL, {
      type: 'compartmentWidths',
      widths: [400, 600, 700],
    });
    const loosened = reduce(fixed, { type: 'evenWidths' });

    // Le chemin du retour : une largeur posée doit pouvoir se défaire autrement qu'en
    // annulant, parce qu'une annulation ne se rattrape pas trois séances plus tard.
    for (const compartment of loosened.compartments) {
      expect('widthMm' in compartment).toBe(false);
    }
  });

  it('sont des millimètres entiers', () => {
    const after = reduce(MODEL, {
      type: 'compartmentWidths',
      widths: [400.6, 599.2, undefined],
    });

    // Le moteur ne travaille qu'en entiers : une largeur fractionnaire s'y arrondirait
    // ailleurs, et deux arrondis valent une cote fausse.
    expect(after.compartments[0]?.widthMm).toBe(401);
    expect(after.compartments[1]?.widthMm).toBe(599);
  });
});

describe('tirer un séparateur', () => {
  it('donne à l’un ce qu’il prend à l’autre', () => {
    const widths = resizeAt([600, 600, 600], 0, 80);

    // La somme ne bouge pas : c'est ce qui garde la largeur du meuble intacte sans que le
    // moteur ait à rattraper un écart après coup.
    expect(widths).toEqual([680, 520, 600]);
  });

  it('s’arrête sur le minimum du voisin', () => {
    const widths = resizeAt([600, 100, 600], 0, 500) as number[];

    // Un arrêt franc se comprend ; un compartiment qui disparaîtrait sous le pointeur, non.
    expect(widths[1]).toBe(LIMITS.compartmentWidthMm.min);
    expect((widths[0] as number) + (widths[1] as number)).toBe(700);
  });

  it('ne rend rien quand il n’y a rien à déplacer', () => {
    expect(resizeAt([600, 600], 1, 40)).toBeNull();
    expect(resizeAt([600, 600], 0, 0)).toBeNull();
  });
});

describe('les poignées', () => {
  const WITH_DOOR = reduce(reduce(MODEL, { type: 'doors', index: 0, count: 1 }), {
    type: 'addPull',
    index: 0,
    target: 'door',
    slot: 0,
    key: 'pull_bar_128',
  });

  it('se posent, et une seule par façade', () => {
    expect(WITH_DOOR.compartments[0]?.pulls).toHaveLength(1);

    // Deux poignées sur la même façade se percent deux fois au même endroit, et la
    // seconde vis traverse le premier trou.
    const twice = reduce(WITH_DOOR, {
      type: 'addPull',
      index: 0,
      target: 'door',
      slot: 0,
      key: 'pull_knob',
    });

    expect(twice).toBe(WITH_DOOR);
  });

  it('se retirent, celle qu’on désigne', () => {
    const two = reduce(WITH_DOOR, {
      type: 'addPull',
      index: 0,
      target: 'drawer',
      slot: 0,
      key: 'pull_knob',
    });
    const after = reduce(two, { type: 'removePull', index: 0, pull: 0 });

    expect(after.compartments[0]?.pulls.map((pull) => pull.key)).toEqual(['pull_knob']);
  });

  it('changent de forme sans bouger', () => {
    const moved = reduce(WITH_DOOR, {
      type: 'movePull',
      index: 0,
      pull: 0,
      xMm: 120,
      yMm: 400,
    });
    const reshaped = reduce(moved, {
      type: 'setPullKey',
      index: 0,
      pull: 0,
      key: 'pull_shell',
    });

    // La forme et la position sont deux décisions : changer l'une ne doit pas défaire
    // l'autre, sinon replacer une poignée devient une corvée à chaque essai.
    expect(reshaped.compartments[0]?.pulls[0]).toEqual({
      target: 'door',
      slot: 0,
      key: 'pull_shell',
      xMm: 120,
      yMm: 400,
    });
  });

  it('se déplacent en entiers, jamais en négatif', () => {
    const moved = reduce(WITH_DOOR, {
      type: 'movePull',
      index: 0,
      pull: 0,
      xMm: -40.7,
      yMm: 399.4,
    });

    expect(moved.compartments[0]?.pulls[0]?.xMm).toBe(0);
    expect(moved.compartments[0]?.pulls[0]?.yMm).toBe(399);
  });

  it('suivent leur compartiment quand on le duplique', () => {
    const twice = reduce(WITH_DOOR, { type: 'duplicateCompartment', index: 0 });

    // C'est la raison pour laquelle une poignée vit dans son compartiment : une liste
    // globale aurait demandé de renuméroter des références, et une référence oubliée est
    // une poignée sur une façade qui n'existe plus.
    expect(twice.compartments[1]?.pulls).toEqual(WITH_DOOR.compartments[0]?.pulls);
  });

  it('disparaissent avec leur compartiment', () => {
    const after = reduce(WITH_DOOR, { type: 'removeCompartment', index: 0 });

    for (const compartment of after.compartments) {
      expect(compartment.pulls).toEqual([]);
    }
  });

  it('ignorent un rang qui n’existe pas', () => {
    for (const action of [
      { type: 'removePull', index: 0, pull: 9 },
      { type: 'setPullKey', index: 0, pull: 9, key: 'pull_knob' },
      { type: 'movePull', index: 0, pull: 9, xMm: 10, yMm: 10 },
      { type: 'addPull', index: 9, target: 'door', slot: 0, key: 'pull_knob' },
    ] as const) {
      expect(reduce(WITH_DOOR, action)).toBe(WITH_DOOR);
    }
  });

  it('refusent de dépasser le plafond', () => {
    let model = WITH_DOOR;
    for (let slot = 0; slot < PULLS_PER_COMPARTMENT_MAX + 3; slot += 1) {
      model = reduce(model, {
        type: 'addPull',
        index: 0,
        target: 'drawer',
        slot,
        key: 'pull_knob',
      });
    }

    expect(model.compartments[0]?.pulls).toHaveLength(PULLS_PER_COMPARTMENT_MAX);
  });
});

describe('un projet enregistré avant les poignées', () => {
  /**
   * Ce qu'une base contient réellement pour un projet d'avant.
   *
   * Ni `pulls`, ni `widthMm`, ni `respectGrain` : ces champs n'existaient pas quand il a
   * été écrit. Le type qui l'annonce `ParsedFurnitureInput` ment — c'est du JSON relu.
   */
  const LEGACY = {
    dimensions: { widthMm: 1800, heightMm: 2000, depthMm: 400 },
    compartments: [
      { shelves: 3, drawers: 0, doors: 0 },
      { shelves: 1, drawers: 2, doors: 1 },
    ],
    material: 'mdf',
    hasBack: true,
  };

  it('retrouve les champs que le schéma a gagnés depuis', () => {
    const model = normalise(LEGACY);

    for (const compartment of model.compartments) {
      expect(compartment.pulls).toEqual([]);
    }
    expect(model.respectGrain).toBe(false);
  });

  it('survit au clic droit', () => {
    // **Le défaut signalé.** `compartment.pulls.some(...)` levait « Cannot read properties
    // of undefined » et le menu contextuel cessait de s'ouvrir sur tout projet ancien.
    const model = normalise(LEGACY);

    expect(() =>
      reduce(model, {
        type: 'addPull',
        index: 0,
        target: 'door',
        slot: 0,
        key: 'pull_knob',
      }),
    ).not.toThrow();
  });

  it('ne touche pas à ce qui était déjà là', () => {
    const model = normalise(LEGACY);

    expect(model.dimensions).toEqual(LEGACY.dimensions);
    expect(model.compartments.map((entry) => entry.shelves)).toEqual([3, 1]);
    expect(model.compartments[1]?.drawers).toBe(2);
  });

  it('est sans effet sur un modèle déjà à jour', () => {
    // Passer deux fois ne doit rien changer : la normalisation est une remise en forme,
    // pas une transformation.
    expect(normalise(normalise(MODEL))).toEqual(normalise(MODEL));
  });
});
