import { describe, it, expect } from 'vitest';
import { build } from '@neftya/engine';
import { LIMITS, defaultModel, reduce, resizeAt } from './model.js';

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
