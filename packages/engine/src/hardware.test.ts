import { describe, it, expect } from 'vitest';
import {
  DOWEL,
  HINGE,
  SHELF_SUPPORT,
  SLIDES,
  SLIDE_LENGTHS_MM,
  hingePositionsMm,
  hingesFor,
  slideFor,
} from './hardware.js';

/**
 * Le catalogue de quincaillerie.
 *
 * Ce ne sont pas des constantes décoratives : chacune décide d'un perçage. Une cote fausse
 * ici produit un plan cohérent avec lui-même et un meuble qui ne se monte pas.
 */

describe('charnières', () => {
  it.each([
    [700, 2],
    [900, 2],
    [901, 3],
    [1600, 3],
    [1601, 4],
    [2000, 4],
    [2001, 5],
  ])('un vantail de %i mm en demande %i', (heightMm, expected) => {
    expect(hingesFor(heightMm)).toBe(expected);
  });

  it('place les charnières d’extrémité au retrait annoncé', () => {
    const positions = hingePositionsMm(2000);

    expect(positions[0]).toBe(HINGE.endOffsetMm);
    expect(positions.at(-1)).toBe(2000 - HINGE.endOffsetMm);
  });

  it('répartit les intermédiaires sans dérive d’arrondi', () => {
    // Un pas arrondi puis accumulé décale la dernière charnière de plusieurs millimètres,
    // et c'est celle qui ne tombe plus en face de son embase. Chaque position est donc
    // calculée depuis les bornes exactes.
    for (const heightMm of [1201, 1801, 2401, 2403]) {
      const positions = hingePositionsMm(heightMm);
      const gaps = positions.slice(1).map((value, index) => value - (positions[index] as number));

      expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
      expect(positions.at(-1)).toBe(heightMm - HINGE.endOffsetMm);
    }
  });

  it('reste dans le vantail même quand il est trop court pour deux retraits', () => {
    // 150 mm de haut : les deux retraits de 100 se croiseraient et la première charnière
    // sortirait de la pièce.
    for (const position of hingePositionsMm(150)) {
      expect(position).toBeGreaterThanOrEqual(0);
      expect(position).toBeLessThanOrEqual(150);
    }
  });

  it('garde le boîtier dans l’épaisseur du chant', () => {
    // Le bord du boîtier à 4,5 mm du chant : moins, la fraise débouche.
    expect(HINGE.cupInsetMm - HINGE.cupDiameterMm / 2).toBeGreaterThan(3);
  });
});

describe('coulisses', () => {
  it('ne propose que des longueurs du commerce', () => {
    expect(SLIDES.map((slide) => slide.lengthMm)).toEqual([...SLIDE_LENGTHS_MM]);
  });

  it('retient la plus longue qui tienne dans la profondeur', () => {
    expect(slideFor(500)?.lengthMm).toBe(500);
    expect(slideFor(499)?.lengthMm).toBe(450);
    expect(slideFor(250)?.lengthMm).toBe(250);
  });

  it('ne rend rien plutôt qu’une coulisse qui dépasse', () => {
    // Un caisson de 249 mm ne reçoit aucune coulisse du commerce. En rendre une de 250
    // produirait un perçage juste pour un article qui ne rentre pas.
    expect(slideFor(249)).toBeNull();
  });
});

describe('tourillons et taquets', () => {
  it('perce moins profond que le tourillon n’est long, des deux côtés', () => {
    // Deux fois 16 pour un tourillon de 30 : sans le reste, le tourillon touche le fond
    // avant que les deux pièces ne se touchent, et le joint reste ouvert.
    expect(DOWEL.holeDepthMm * 2).toBeGreaterThan(DOWEL.lengthMm);
  });

  it('ne traverse pas un panneau de 18', () => {
    for (const depthMm of [DOWEL.holeDepthMm, SHELF_SUPPORT.holeDepthMm, HINGE.cupDepthMm]) {
      expect(depthMm).toBeLessThan(18);
    }
  });
});
