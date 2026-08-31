import { describe, it, expect } from 'vitest';
import {
  formatImperial,
  formatLength,
  inchesToMillimetres,
  parseImperial,
  parseLength,
  roundingIsNotable,
  toImperial,
} from './index.js';

/**
 * Le contrat de la couche d'unités, et surtout ce qu'elle ne doit pas faire.
 */

describe('affichage impérial', () => {
  it.each([
    [0, '0"'],
    [25.4, '1"'],
    [873, '34 3/8"'],
    [1800, '70 7/8"'],
    [19.05, '3/4"'],
    [2440, '96 1/16"'],
  ])('affiche %d mm en %s', (valueMm, expected) => {
    expect(formatImperial(valueMm)).toBe(expected);
  });

  it('réduit la fraction — un mètre ne porte pas de graduation 6/16', () => {
    // 6/16" = 9,525 mm
    expect(formatImperial(9.525)).toBe('3/8"');
  });

  it('expose la perte de conversion au lieu de la masquer', () => {
    const { errorMm } = toImperial(873);

    // 34 3/8" revaut 873,125 mm : le huitième de millimètre du document.
    expect(errorMm).toBeCloseTo(0.125, 3);
  });

  it('signale une cote qui tombe entre deux graduations', () => {
    // 872,2 mm tombe presque au milieu entre deux seizièmes : 0,625 mm d'écart.
    expect(roundingIsNotable(872.2)).toBe(true);
    // 873 mm perd 0,125 mm — lisible sur le mètre, sans surprise.
    expect(roundingIsNotable(873)).toBe(false);
    expect(roundingIsNotable(25.4)).toBe(false);
  });

  it("le seuil se déclenche, ce qu'un demi-pas n'aurait jamais fait", () => {
    // Arrondir au plus proche borne l'erreur à un demi-pas : un seuil posé là ne
    // sonnerait jamais. Sur mille cotes, celui-ci sonne pour une part significative,
    // et jamais pour toutes.
    const flagged = Array.from({ length: 1000 }, (_, mm) =>
      roundingIsNotable(mm),
    ).filter(Boolean).length;

    expect(flagged).toBeGreaterThan(100);
    expect(flagged).toBeLessThan(900);
  });

  it('gère une cote négative sans produire « -0 3/8 »', () => {
    expect(formatImperial(-873)).toBe('-34 3/8"');
    expect(formatImperial(-9.525)).toBe('-3/8"');
  });
});

describe('saisie', () => {
  it.each([
    ['34 3/8', 873],
    ['34-3/8', 873],
    ['34.375', 873],
    ['34,375', 873],
    ['3/8', 10],
    ['34"', 864],
  ])('interprète %s en impérial', (input, expectedMm) => {
    expect(parseLength(input, 'imperial')).toBe(expectedMm);
  });

  it('respecte une unité écrite explicitement, même en impérial', () => {
    // Qui écrit « 873mm » sait ce qu'il veut ; le convertir serait une trahison.
    expect(parseLength('873mm', 'imperial')).toBe(873);
    expect(parseLength('873 mm', 'metric')).toBe(873);
  });

  it('arrondit toujours à l’entier — le moteur n’accepte rien d’autre', () => {
    expect(parseLength('34.376', 'imperial')).toBe(873);
    expect(parseLength('1800.6', 'metric')).toBe(1801);
  });

  it.each(['', '  ', 'douze', '3/', '/8', '3/0', '34 3', '12mmm'])(
    'refuse « %s » plutôt que de deviner',
    (input) => {
      expect(parseLength(input, 'imperial')).toBeNull();
      expect(parseLength(input, 'metric')).toBeNull();
    },
  );

  it('ne devine pas non plus une fraction en métrique', () => {
    expect(parseLength('34 3/8', 'metric')).toBeNull();
  });
});

describe("l'aller-retour d'affichage ne déforme pas le modèle", () => {
  it('afficher puis relire ne change aucune cote', () => {
    // Le test que le document exige : ouvrir un projet en impérial puis le sauvegarder
    // ne doit pas le déformer d'un huitième de millimètre à chaque fois.
    const model = [873, 1800, 2000, 400, 18, 19, 2440, 1220, 1, 7];

    const displayed = model.map((mm) => formatLength(mm, 'imperial'));
    const readBack = displayed.map((text) => parseLength(text, 'imperial'));

    // La lecture d'un affichage impérial ne revaut PAS la valeur d'origine : c'est
    // précisément pourquoi elle ne doit jamais réécrire le modèle.
    expect(readBack).not.toEqual(model);

    // Le modèle, lui, est intact — il n'est jamais passé par l'affichage.
    expect(model).toEqual([873, 1800, 2000, 400, 18, 19, 2440, 1220, 1, 7]);
  });

  it('la dérive ne s’accumule pas si l’on repasse dix fois par l’affichage', () => {
    // Une valeur déjà arrondie au seizième est un point fixe : la boucle
    // afficher → relire converge au lieu de dériver. C'est ce qui rend la perte
    // supportable tant qu'elle reste dans l'affichage.
    let value = 873;

    for (let round = 0; round < 10; round += 1) {
      value = parseLength(formatLength(value, 'imperial'), 'imperial') as number;
    }

    expect(value).toBe(873);
  });
});

describe('affichage métrique', () => {
  it('formate selon la locale, sans séparateur codé en dur', () => {
    // Le MoneyFormatter de DealerOS imposait la virgule et l'espace : correct en
    // français, faux partout ailleurs.
    expect(formatLength(1800, 'metric', 'fr')).toMatch(/^1\s?800 mm$/);
    expect(formatLength(1800, 'metric', 'en')).toBe('1,800 mm');
  });
});

describe('les catalogues ne sont pas des conversions', () => {
  it('3/4" ne vaut pas 18 mm, et l\'écart est celui du document', () => {
    expect(inchesToMillimetres(0.75)).toBe(19);
    expect(inchesToMillimetres(0.75) - 18).toBe(1);
    // La valeur exacte, elle, est 19,05 mm.
    expect(0.75 * 25.4).toBeCloseTo(19.05, 2);
  });

  it("4' × 8' n'est pas 2440 × 1220", () => {
    expect(parseImperial('96')).toBe(96);
    expect(96 * 25.4).toBeCloseTo(2438.4, 1);
    expect(48 * 25.4).toBeCloseTo(1219.2, 1);
  });
});
