import { describe, it, expect } from 'vitest';
import { build, type FurnitureInput } from '@neftya/engine';
import { technicalDrawing } from './technical-drawing.js';
import { technicalDrawingPdf } from './plan-sheet.js';

/**
 * La planche de plans : ce qui sort à l'impression.
 *
 * L'invariant qui compte ici est le même que pour le plan de découpe — rien ne sort de la
 * page. Un trait qui déborde est rogné par l'imprimante, et une cote rognée est une cote
 * perdue.
 */

const REFERENCE: FurnitureInput = {
  dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
  compartments: [
    { shelves: 1, drawers: 0 },
    { shelves: 1, drawers: 0 },
  ],
};

const LABELS = {
  title: 'Bibliothèque — plans',
  view: (view: string) => `Vue : ${view}`,
  partsTitle: 'Pièces',
  columns: ['Repère', 'Rôle', 'Cotes', 'Ép.', 'Qté'] as [
    string,
    string,
    string,
    string,
    string,
  ],
};

const drawing = technicalDrawing(build(REFERENCE), {
  label: (valueMm) => `${valueMm} mm`,
});

function decode(pdf: Uint8Array): string {
  return [...pdf].map((byte) => String.fromCharCode(byte)).join('');
}

describe('planche de plans', () => {
  const pdf = technicalDrawingPdf(drawing, LABELS);
  const text = decode(pdf);

  it('produit une page par vue, plus la table des pièces', () => {
    const pages = [...text.matchAll(/\/Type \/Page[^s]/g)].length;

    expect(pages).toBe(drawing.views.length + 1);
  });

  it('ne laisse rien sortir de la page', () => {
    const rectangles = [
      ...text.matchAll(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) re/g),
    ];

    expect(rectangles.length).toBeGreaterThan(0);
    for (const [, x, y, width, height] of rectangles) {
      expect(Number(x)).toBeGreaterThanOrEqual(0);
      expect(Number(y)).toBeGreaterThanOrEqual(0);
      expect(Number(x) + Number(width)).toBeLessThanOrEqual(842);
      expect(Number(y) + Number(height)).toBeLessThanOrEqual(596);
    }

    for (const [, x, y] of text.matchAll(/([-\d.]+) ([-\d.]+) (?:m|l)\n/g)) {
      expect(Number(x)).toBeGreaterThanOrEqual(0);
      expect(Number(y)).toBeGreaterThanOrEqual(0);
      expect(Number(x)).toBeLessThanOrEqual(842);
      expect(Number(y)).toBeLessThanOrEqual(596);
    }
  });

  it('porte les cotes de découpe de chaque pièce', () => {
    for (const part of drawing.parts) {
      expect(text).toContain(`(${part.partId})`);
      expect(text).toContain(`(${part.lengthMm} x ${part.widthMm})`);
    }
  });

  it('est déterministe', () => {
    expect(technicalDrawingPdf(drawing, LABELS)).toEqual(pdf);
  });

  it('suit la taille de papier', () => {
    expect(text).toContain('/MediaBox [0 0 841.89 595.28]');
    expect(decode(technicalDrawingPdf(drawing, LABELS, 'letter'))).toContain(
      '/MediaBox [0 0 792 612]',
    );
  });

  it('tient sur la page même pour un meuble à cent pièces', () => {
    // Le meuble le plus chargé que la V1 accepte : douze compartiments, tiroirs compris.
    const dense = technicalDrawing(
      build({
        dimensions: { widthMm: 3600, heightMm: 2400, depthMm: 600 },
        compartments: Array.from({ length: 12 }, () => ({ shelves: 3, drawers: 2 })),
      }),
      { label: (valueMm) => `${valueMm} mm` },
    );

    const dark = decode(technicalDrawingPdf(dense, LABELS));

    for (const [, x, y, width, height] of dark.matchAll(
      /([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) re/g,
    )) {
      expect(Number(x)).toBeGreaterThanOrEqual(0);
      expect(Number(y)).toBeGreaterThanOrEqual(0);
      expect(Number(x) + Number(width)).toBeLessThanOrEqual(842);
      expect(Number(y) + Number(height)).toBeLessThanOrEqual(596);
    }
  });
});
