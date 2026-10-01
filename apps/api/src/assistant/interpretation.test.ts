import { describe, it, expect } from 'vitest';
import {
  EXTRACTED_FIELDS,
  MAX_DIMENSION_MM,
  MIN_DIMENSION_MM,
  interpret,
} from './interpretation.js';

/**
 * Ce qu'on accepte d'une sortie de modèle, et ce qu'on refuse.
 *
 * Ce fichier est la garde de l'assistant. Un modèle de langage rend du texte plausible, et
 * « plausible » est exactement le danger : une cote fausse qui a l'air juste traverse tout
 * l'outil sans rien déclencher, et ressort en plan de découpe.
 *
 * Les tests portent donc sur les refus plus que sur les succès.
 */

const COMPLETE = {
  widthMm: 1800,
  heightMm: 2000,
  depthMm: 400,
  compartments: 3,
  shelvesPerCompartment: 2,
  drawersPerCompartment: 0,
  doorsPerCompartment: 1,
  material: 'mdf',
  hasBack: true,
};

describe('une description lisible', () => {
  it('compose un meuble complet', () => {
    const result = interpret(COMPLETE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.model.dimensions).toEqual({
      widthMm: 1800,
      heightMm: 2000,
      depthMm: 400,
    });
    expect(result.model.compartments).toHaveLength(3);
    expect(result.model.material).toBe('mdf');
  });

  it('applique le même aménagement à chaque compartiment', () => {
    const result = interpret(COMPLETE);
    if (!result.ok) throw new Error('attendu composable');

    for (const compartment of result.model.compartments) {
      // Uniforme, et assumé : « le premier en tiroirs » n'est pas exprimable dans une
      // liste de champs plats, et l'interface sait déjà ajuster au compartiment.
      expect(compartment.shelves).toBe(2);
      expect(compartment.doors).toBe(1);
    }
  });

  it('accepte une cote rendue en chaîne', () => {
    // Un modèle rend « 1800 » ou 1800 selon son humeur, et les deux veulent dire la même
    // chose. Refuser l'un ferait échouer un appel sur deux sans raison.
    const result = interpret({ ...COMPLETE, widthMm: '1800', compartments: '2' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model.dimensions.widthMm).toBe(1800);
    expect(result.model.compartments).toHaveLength(2);
  });

  it('laisse au schéma ce dont le modèle n’a rien dit', () => {
    const result = interpret({ widthMm: 800, heightMm: 800, depthMm: 300 });
    if (!result.ok) throw new Error('attendu composable');

    // Les défauts du moteur sont décidés et testés ; les recopier ici les ferait diverger.
    expect(result.model.material).toBe('mdf');
    expect(result.model.hasBack).toBe(true);
    expect(result.model.compartments).toHaveLength(1);
  });

  it('honore un meuble sans fond', () => {
    const result = interpret({ ...COMPLETE, hasBack: false });
    if (!result.ok) throw new Error('attendu composable');

    expect(result.model.hasBack).toBe(false);
  });
});

describe('le facteur mille', () => {
  it('refuse une hauteur lue en mètres', () => {
    // « Une bibliothèque de 1,80 m » mal lue donne 2 mm. Le moteur la calculerait sans
    // broncher, et le plan de découpe sortirait en pièces de fractions de millimètre.
    const result = interpret({ ...COMPLETE, heightMm: 2 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems['heightMm']?.[0]).toContain(String(MIN_DIMENSION_MM));
  });

  it('refuse une cote décimale plutôt que de l’arrondir', () => {
    // Arrondir 1,8 en 2 produirait la même bibliothèque de 2 mm, en ayant l'air d'avoir
    // compris quelque chose.
    const result = interpret({ ...COMPLETE, widthMm: 1.8 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveProperty('widthMm');
  });

  it('refuse une cote qui dépasse le meuble', () => {
    const result = interpret({ ...COMPLETE, widthMm: 18_000 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems['widthMm']?.[0]).toContain(String(MAX_DIMENSION_MM));
  });

  it('accepte les bornes elles-mêmes', () => {
    // Une borne exclusive refuserait un meuble de 4 000 mm, qui existe.
    const result = interpret({
      widthMm: MAX_DIMENSION_MM,
      heightMm: MIN_DIMENSION_MM,
      depthMm: 400,
    });

    expect(result.ok).toBe(true);
  });
});

describe('ce qui manque', () => {
  it('nomme la cote absente, et elle seule', () => {
    const { depthMm: _, ...sansProfondeur } = COMPLETE;
    const result = interpret(sansProfondeur);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    // Un message qui dirait « données invalides » obligerait à deviner trois fois.
    expect(Object.keys(result.problems)).toEqual(['depthMm']);
  });

  it('signale les trois quand la phrase ne parlait pas d’un meuble', () => {
    const result = interpret({ material: 'mdf' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.problems).sort()).toEqual([
      'depthMm',
      'heightMm',
      'widthMm',
    ]);
  });

  it('refuse une matière que le catalogue ne connaît pas', () => {
    const result = interpret({ ...COMPLETE, material: 'chêne massif du Jura' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Le refus vient du schéma du moteur, pas d'une liste recopiée ici.
    expect(result.problems).toHaveProperty('material');
  });
});

describe('les nombres d’aménagement', () => {
  it('signale un nombre négatif au lieu de le ramener à zéro', () => {
    const result = interpret({ ...COMPLETE, shelvesPerCompartment: -2 });

    // Le corriger en silence fabriquerait un meuble que personne n'a demandé, et la
    // personne croirait avoir été comprise.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveProperty('shelvesPerCompartment');
  });

  it('signale un troisième vantail', () => {
    // Au-delà de deux, ce n'est plus une porte mais une séparation.
    const result = interpret({ ...COMPLETE, doorsPerCompartment: 3 });

    expect(result.ok).toBe(false);
  });

  it('donne un compartiment à un meuble qui n’en nomme aucun', () => {
    const result = interpret({ ...COMPLETE, compartments: 0 });

    // Ce n'est pas un rattrapage de mesure : un meuble a toujours un volume intérieur.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model.compartments).toHaveLength(1);
  });

  it('refuse un nombre de compartiments absurde', () => {
    const result = interpret({ ...COMPLETE, compartments: 500 });

    expect(result.ok).toBe(false);
  });
});

describe('les champs demandés', () => {
  it('couvrent exactement ce que la composition lit', () => {
    // Un champ demandé que personne ne lit se paie à chaque appel ; un champ lu qui n'est
    // pas demandé est toujours absent, et le meuble sort avec un défaut silencieux.
    expect([...EXTRACTED_FIELDS].sort()).toEqual(
      [
        'compartments',
        'depthMm',
        'doorsPerCompartment',
        'drawersPerCompartment',
        'hasBack',
        'heightMm',
        'material',
        'shelvesPerCompartment',
        'widthMm',
      ].sort(),
    );
  });

  it('nomment leur unité, parce que c’est le seul levier qu’on ait', () => {
    // Les instructions de la tâche appartiennent à la plateforme et ne sont pas
    // surchargeables : le nom du champ est tout ce qui dit au modèle ce qu'on attend.
    for (const field of ['widthMm', 'heightMm', 'depthMm']) {
      expect(EXTRACTED_FIELDS).toContain(field);
    }
  });
});
