import { describe, it, expect } from 'vitest';
import { build } from '@neftya/engine';
import { formatLength, parseLength } from '@neftya/units';
import { LIMITS, defaultModel, presets, reduce } from './model.js';

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
    expect(model.compartments[4]).toEqual({ shelves: 0, drawers: 0, doors: 0 });
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

describe('modèles prédéfinis', () => {
  it('se construisent tous sans cote négative ni pièce absurde', () => {
    for (const preset of presets()) {
      const furniture = build(preset.model);

      expect(furniture.parts.length).toBeGreaterThan(0);
      for (const part of furniture.parts) {
        expect(part.lengthMm).toBeGreaterThan(0);
        expect(part.widthMm).toBeGreaterThan(0);
        expect(Number.isInteger(part.lengthMm)).toBe(true);
      }
    }
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
