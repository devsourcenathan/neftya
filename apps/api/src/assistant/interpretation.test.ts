import { describe, it, expect } from 'vitest';
import {
  EXTRACTED_FIELDS,
  IMAGE_FIELDS,
  MAX_DIMENSION_MM,
  MAX_RATIO,
  MIN_DIMENSION_MM,
  interpret,
  interpretFromImage,
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

describe('depuis une image, à une échelle donnée', () => {
  const SEEN = {
    heightRatio: 1.25,
    depthRatio: 0.25,
    compartments: 3,
    shelvesPerCompartment: 2,
    material: 'mdf',
  };

  it('déduit les deux cotes de la largeur donnée', () => {
    const result = interpretFromImage(SEEN, { widthMm: 1600 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 1600 × 1,25 = 2000 ; 1600 × 0,25 = 400.
    expect(result.model.dimensions).toEqual({
      widthMm: 1600,
      heightMm: 2000,
      depthMm: 400,
    });
    expect(result.model.compartments).toHaveLength(3);
  });

  it('arrondit au millimètre, parce que le moteur ne connaît que l’entier', () => {
    const result = interpretFromImage(
      { ...SEEN, heightRatio: 1.3333 },
      { widthMm: 900 },
    );
    if (!result.ok) throw new Error('attendu composable');

    expect(result.model.dimensions.heightMm).toBe(1200);
  });

  it('prend la profondeur proposée quand la vue de face n’en montre pas', () => {
    const { depthRatio: _, ...vueDeFace } = SEEN;
    const result = interpretFromImage(
      { ...vueDeFace, depthMm: 320 },
      { widthMm: 1600 },
    );

    /*
     * **Le cas le plus courant, et le changement du 6 octobre.**
     *
     * Une photo prise en face ne montre aucune profondeur, et un modèle honnête rend `null`
     * pour la proportion. On refusait alors — ce qui laissait l'utilisateur devant un écran
     * vide à remplir de mémoire. On prend maintenant la cote proposée : elle s'affiche en
     * clair avant qu'aucun projet n'existe, et celui qui a pris la photo corrige d'un regard.
     */
    if (!result.ok) throw new Error('attendu composable');
    expect(result.model.dimensions.depthMm).toBe(320);
  });

  it('refuse quand même quand rien ne tient', () => {
    const { depthRatio: _, ...vueDeFace } = SEEN;
    const result = interpretFromImage(vueDeFace, { widthMm: 1600 });

    // Ni proportion, ni proposition, ni mesure : proposer une profondeur « habituelle »
    // ici reviendrait à l'inventer nous-mêmes.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.problems)).toEqual(['depthMm']);
  });

  it('propose la largeur quand on n’en donne aucune', () => {
    const result = interpretFromImage({ ...SEEN, widthMm: 900 });

    if (!result.ok) throw new Error('attendu composable');
    expect(result.model.dimensions.widthMm).toBe(900);
    // La hauteur suit la proportion lue, appliquée à la largeur proposée.
    expect(result.model.dimensions.heightMm).toBe(1125);
  });

  it('refuse une largeur proposée hors de ce qu’un meuble mesure', () => {
    // Une proposition absurde use plus de confiance qu'une absence.
    const result = interpretFromImage({ ...SEEN, widthMm: 40_000 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveProperty('widthMm');
  });

  it('accepte la profondeur donnée, et ignore alors la proportion', () => {
    const { depthRatio: _, ...vueDeFace } = SEEN;
    const result = interpretFromImage(vueDeFace, { widthMm: 1600, depthMm: 350 });
    if (!result.ok) throw new Error('attendu composable');

    expect(result.model.dimensions).toEqual({
      widthMm: 1600,
      heightMm: 2000,
      depthMm: 350,
    });
  });

  it('préfère la profondeur mesurée à celle que le modèle propose', () => {
    // Qui mesure son meuble sait mieux que qui le regarde en photo.
    const result = interpretFromImage(SEEN, { widthMm: 1600, depthMm: 320 });
    if (!result.ok) throw new Error('attendu composable');

    expect(result.model.dimensions.depthMm).toBe(320);
  });

  it('refuse une proportion illisible, sans la confondre avec une absence', () => {
    const result = interpretFromImage(
      { ...SEEN, depthRatio: 'je ne sais pas' },
      { widthMm: 1600 },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Deux reproches pour un seul défaut égareraient : un seul champ est nommé.
    expect(Object.keys(result.problems)).toEqual(['depthMm']);
  });

  it('refuse une proportion qui n’en est pas une', () => {
    // Un meuble cent fois plus haut que large n'existe pas : c'est un rapport lu à
    // l'envers, ou une invention.
    const result = interpretFromImage({ ...SEEN, heightRatio: 100 }, { widthMm: 1600 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems['heightRatio']?.[0]).toContain(String(MAX_RATIO));
  });

  it('refuse une proportion négative ou nulle', () => {
    for (const heightRatio of [0, -1.2]) {
      expect(interpretFromImage({ ...SEEN, heightRatio }, { widthMm: 1600 }).ok).toBe(
        false,
      );
    }
  });

  it('attrape une cote absurde après la mise à l’échelle', () => {
    /*
     * Le rapport est plausible, le produit non.
     *
     * 0,06 × 1 000 fait 60 mm : un meuble de six centimètres de haut. Les bornes en
     * millimètres restent le vrai filet — le rapport, lui, n'avait l'air de rien.
     */
    const result = interpretFromImage(
      { ...SEEN, heightRatio: 0.06 },
      { widthMm: 1000 },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveProperty('heightMm');
  });

  it('préfère toujours la largeur donnée à celle proposée', () => {
    const result = interpretFromImage({ ...SEEN, widthMm: 999 }, { widthMm: 1200 });
    if (!result.ok) throw new Error('attendu composable');

    // Qui mesure son meuble sait mieux que qui le regarde en photo.
    expect(result.model.dimensions.widthMm).toBe(1200);
  });
});

describe('les champs demandés pour une image', () => {
  it('demandent des proportions, et des cotes seulement comme propositions', () => {
    /*
     * Ce test disait « aucune cote », et c'était la décision du matin : demander des
     * millimètres à un modèle qui regarde une photo, c'est lui demander d'inventer.
     *
     * Elle a changé l'après-midi, à l'usage : refuser laissait l'utilisateur devant un
     * écran vide à remplir de mémoire. Ce qui tient, c'est que **la hauteur vienne toujours
     * d'une proportion** — ce que la photo montre vraiment — et que les millimètres ne
     * soient que des ordres de grandeur, affichés avant qu'aucun projet n'existe.
     */
    expect(IMAGE_FIELDS).toContain('heightRatio');
    expect(IMAGE_FIELDS).not.toContain('heightMm');
    expect(IMAGE_FIELDS).toContain('widthMm');
    expect(IMAGE_FIELDS).toContain('depthMm');
  });

  it('demandent les deux proportions', () => {
    expect(IMAGE_FIELDS).toContain('heightRatio');
    expect(IMAGE_FIELDS).toContain('depthRatio');
  });

  it('partagent la structure avec la description écrite', () => {
    // La structure est la même chose vue autrement : la composer deux fois les ferait
    // diverger.
    for (const field of [
      'compartments',
      'shelvesPerCompartment',
      'material',
      'hasBack',
    ]) {
      expect(IMAGE_FIELDS).toContain(field);
      expect(EXTRACTED_FIELDS).toContain(field);
    }
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
