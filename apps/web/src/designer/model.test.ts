import { describe, it, expect } from 'vitest';
import { build } from '@neftya/engine';
import { formatLength, parseLength } from '@neftya/units';
import { LIMITS, defaultModel, reduce } from './model.js';

/**
 * Les modifications du modèle sont des fonctions pures : elles se testent sans navigateur,
 * sans 3D et sans serveur.
 */

describe('modifications du modèle', () => {
  it('arrondit toute cote à l’entier — un curseur peut rendre 1800,4', () => {
    const model = reduce(defaultModel(), {
      type: 'dimension',
      axis: 'widthMm',
      valueMm: 1800.4,
    });

    expect(model.dimensions.widthMm).toBe(1800);
    expect(Number.isInteger(model.dimensions.widthMm)).toBe(true);
  });

  it('borne les cotes plutôt que de laisser le moteur refuser', () => {
    const wide = reduce(defaultModel(), {
      type: 'dimension',
      axis: 'widthMm',
      valueMm: 99_000,
    });
    const thin = reduce(defaultModel(), {
      type: 'dimension',
      axis: 'widthMm',
      valueMm: -5,
    });

    expect(wide.dimensions.widthMm).toBe(LIMITS.widthMm.max);
    expect(thin.dimensions.widthMm).toBe(LIMITS.widthMm.min);
  });

  it('élargir n’ajoute aucun compartiment — c’est la propagation par étirement', () => {
    // Le nombre d'éléments est décidé par l'utilisateur et ne change jamais tout seul.
    const before = defaultModel();
    const after = reduce(before, { type: 'dimension', axis: 'widthMm', valueMm: 2600 });

    expect(after.compartments).toEqual(before.compartments);
    expect(build(after).parts.length).toBeGreaterThan(0);
  });

  it('réduire le nombre de compartiments conserve ceux qui restent', () => {
    const model = reduce(defaultModel(), { type: 'compartments', count: 2 });

    expect(model.compartments).toHaveLength(2);
    expect(model.compartments[0]?.shelves).toBe(3);
    expect(model.compartments[1]?.drawers).toBe(2);
  });

  it('en ajouter en crée de vides, sans toucher aux précédents', () => {
    const model = reduce(defaultModel(), { type: 'compartments', count: 5 });

    expect(model.compartments).toHaveLength(5);
    expect(model.compartments[0]?.shelves).toBe(3);
    // Un compartiment neuf n'a pas de poignée : elles se posent, elles ne
    // s'héritent pas.
    expect(model.compartments[4]).toEqual({
      shelves: 0,
      drawers: 0,
      doors: 0,
      pulls: [],
      shelfSpacesMm: [],
    });
  });

  it('ne modifie jamais le modèle reçu', () => {
    const before = defaultModel();
    const snapshot = JSON.stringify(before);

    reduce(before, { type: 'dimension', axis: 'heightMm', valueMm: 2400 });
    reduce(before, { type: 'shelves', index: 0, count: 8 });
    reduce(before, { type: 'compartments', count: 1 });

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("l'affichage n'entre jamais dans le modèle", () => {
  it('régler en impérial puis afficher ne déforme pas les cotes stockées', () => {
    // Le piège du document : ouvrir en impérial puis sauvegarder déformerait le projet
    // d'un huitième de millimètre à chaque fois si l'affichage réécrivait le modèle.
    let model = defaultModel();

    for (let round = 0; round < 20; round += 1) {
      // Ce que l'utilisateur voit…
      const shown = formatLength(model.dimensions.widthMm, 'imperial');
      // …ne revient dans le modèle que s'il le saisit lui-même.
      expect(shown).toMatch(/"$/);
      model = reduce(model, {
        type: 'dimension',
        axis: 'widthMm',
        valueMm: model.dimensions.widthMm,
      });
    }

    expect(model.dimensions.widthMm).toBe(1800);
  });

  it('une saisie explicite, elle, reconvertit — et arrondit à l’entier', () => {
    const parsed = parseLength('70 7/8', 'imperial');
    const model = reduce(defaultModel(), {
      type: 'dimension',
      axis: 'widthMm',
      valueMm: parsed as number,
    });

    expect(model.dimensions.widthMm).toBe(1800);
  });
});

describe('une largeur saisie, compartiment par compartiment', () => {
  const four = () => reduce(defaultModel(), { type: 'compartments', count: 4 });

  it('n’impose que celui qu’on vise', () => {
    /*
     * **La différence avec le glissement, et toute sa raison d'être.** Tirer un séparateur
     * impose les deux largeurs qu'il sépare : un geste ne peut pas en changer une sans
     * toucher à sa voisine. Saisir un nombre, si — et c'est ce qu'il faut pour un socle de
     * tiroirs de 400 mm sous une penderie qui prend le reste.
     *
     * Si cette action imposait aussi les voisines, la capacité du moteur — une largeur
     * fixe à côté de largeurs souples — redeviendrait inatteignable, ce qu'elle était.
     */
    const model = reduce(four(), { type: 'compartmentWidth', index: 0, widthMm: 400 });

    expect(model.compartments.map((entry) => entry.widthMm)).toEqual([
      400,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('rend un compartiment souple sans toucher aux autres', () => {
    // Le chemin du retour, pour un seul : « Égaliser les largeurs » les libère tous, ce
    // qui n'aide pas qui veut garder son socle et libérer le reste.
    const fixed = reduce(
      reduce(four(), { type: 'compartmentWidth', index: 0, widthMm: 400 }),
      { type: 'compartmentWidth', index: 1, widthMm: 500 },
    );

    const freed = reduce(fixed, {
      type: 'compartmentWidth',
      index: 1,
      widthMm: undefined,
    });

    expect(freed.compartments.map((entry) => entry.widthMm)).toEqual([
      400,
      undefined,
      undefined,
      undefined,
    ]);
    // Et la clé disparaît : un `undefined` écrit vaudrait « imposé à rien » au moteur.
    expect('widthMm' in (freed.compartments[1] as object)).toBe(false);
  });

  it('refuse une largeur qu’un compartiment ne peut pas recevoir', () => {
    // En deçà du minimum, un compartiment ne reçoit plus ni étagère, ni tiroir, ni porte.
    const model = reduce(four(), { type: 'compartmentWidth', index: 0, widthMm: 5 });

    expect(model.compartments[0]?.widthMm).toBe(LIMITS.compartmentWidthMm.min);
  });
});

describe('les hauteurs d’espace entre étagères', () => {
  const shelved = () => reduce(defaultModel(), { type: 'shelves', index: 0, count: 3 });

  it('se posent au bon rang, en complétant de souples', () => {
    /*
     * **Le défaut qu'il faut écarter.** Fixer le troisième espace d'un compartiment qui
     * n'en a aucun ne doit pas écrire la valeur au premier rang venu : le menuisier
     * verrait sa cote appliquée en bas de meuble alors qu'il visait le haut.
     */
    const model = reduce(shelved(), {
      type: 'shelfSpace',
      index: 0,
      space: 2,
      heightMm: 400,
    });

    expect(model.compartments[0]?.shelfSpacesMm).toEqual([null, null, 400]);
  });

  it('retire les souples de queue quand on libère', () => {
    /*
     * Un modèle sans aucune contrainte redevient un tableau vide, et non une suite de
     * `null` que personne ne sait relire — ni l'écran, ni la prochaine lecture du projet.
     */
    const fixed = reduce(shelved(), {
      type: 'shelfSpace',
      index: 0,
      space: 1,
      heightMm: 500,
    });

    expect(fixed.compartments[0]?.shelfSpacesMm).toEqual([null, 500]);

    const freed = reduce(fixed, {
      type: 'shelfSpace',
      index: 0,
      space: 1,
      heightMm: undefined,
    });

    expect(freed.compartments[0]?.shelfSpacesMm).toEqual([]);
  });

  it('garde les souples intercalés', () => {
    // Ceux-là portent une information : « le premier est libre, le deuxième fait 400 ».
    // Les retirer décalerait le second d'un rang.
    const model = reduce(
      reduce(shelved(), { type: 'shelfSpace', index: 0, space: 2, heightMm: 400 }),
      { type: 'shelfSpace', index: 0, space: 3, heightMm: 300 },
    );

    expect(model.compartments[0]?.shelfSpacesMm).toEqual([null, null, 400, 300]);
  });

  it('ne touche qu’au compartiment visé', () => {
    const model = reduce(reduce(defaultModel(), { type: 'compartments', count: 3 }), {
      type: 'shelfSpace',
      index: 1,
      space: 0,
      heightMm: 400,
    });

    expect(model.compartments.map((entry) => entry.shelfSpacesMm)).toEqual([
      [],
      [400],
      [],
    ]);
  });
});
