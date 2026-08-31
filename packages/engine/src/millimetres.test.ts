import { describe, it, expect } from 'vitest';
import { millimetres, recomposes, divideEvenly } from './millimetres.js';

describe('millimetres', () => {
  it('accepte un entier', () => {
    expect(millimetres.parse(873)).toBe(873);
    expect(millimetres.parse(0)).toBe(0);
    expect(millimetres.parse(-18)).toBe(-18);
  });

  it('refuse une cote à virgule', () => {
    // 873,125 est ce que vaut « 34 3/8" » : la couche d'affichage peut le produire,
    // le moteur ne doit jamais l'accepter.
    expect(() => millimetres.parse(873.125)).toThrow();
  });

  it('refuse ce qui n’est pas un nombre fini', () => {
    expect(() => millimetres.parse(Number.NaN)).toThrow();
    expect(() => millimetres.parse(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('recomposes', () => {
  it('reconnaît une recomposition exacte', () => {
    // Le meuble de référence : 18 + 873 + 18 + 873 + 18 = 1800.
    expect(recomposes([18, 873, 18, 873, 18], 1800)).toBe(true);
  });

  it('refuse un écart d’un seul millimètre', () => {
    // Pas de marge « pour absorber les arrondis » : elle rendrait le contrôle
    // incapable de distinguer un arrondi d'un vrai défaut.
    expect(recomposes([18, 873, 18, 873, 17], 1800)).toBe(false);
    expect(recomposes([18, 873, 18, 873, 19], 1800)).toBe(false);
  });

  it('accepte une liste vide face à zéro', () => {
    expect(recomposes([], 0)).toBe(true);
  });
});

describe('divideEvenly', () => {
  it('répartit une division juste', () => {
    // 1800 − 2×18 (côtés) − 2×18 (séparateurs) = 1728, en 3 compartiments.
    expect(divideEvenly(1728, 3)).toEqual([576, 576, 576]);
  });

  it('donne le reste à la dernière part', () => {
    // 2200 : 2164 intérieur, 2128 disponible, 2128 / 3 = 709,33.
    expect(divideEvenly(2128, 3)).toEqual([709, 709, 710]);
  });

  it('recompose toujours le total', () => {
    for (const total of [1728, 2128, 1, 7, 999, 100001]) {
      for (const count of [1, 2, 3, 5, 7]) {
        expect(recomposes(divideEvenly(total, count), total)).toBe(true);
      }
    }
  });

  it('ne rend que des entiers', () => {
    for (const part of divideEvenly(1000, 7)) {
      expect(Number.isInteger(part)).toBe(true);
    }
  });

  it('refuse un total non entier ou un nombre de parts absurde', () => {
    expect(() => divideEvenly(1728.5, 3)).toThrow(RangeError);
    expect(() => divideEvenly(1728, 0)).toThrow(RangeError);
    expect(() => divideEvenly(1728, -1)).toThrow(RangeError);
  });

  it('est déterministe', () => {
    // Le moteur est pur : même entrée, même sortie, toujours.
    expect(divideEvenly(2128, 3)).toEqual(divideEvenly(2128, 3));
  });
});
