import { describe, it, expect } from 'vitest';
import { build, nest, type FurnitureInput } from '@neftya/engine';
import { cutPlanPdf, cutPlanSvg } from './cut-plan.js';
import { renderPdf } from './pdf.js';

/**
 * Le plan produit doit être un fichier qu'un lecteur ouvre, et un dessin qui respecte les
 * proportions du panneau. Un plan à la mauvaise échelle est un plan faux.
 */

const REFERENCE: FurnitureInput = {
  dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
  compartments: [
    { shelves: 1, drawers: 0 },
    { shelves: 1, drawers: 0 },
  ],
  material: 'mdf',
  hasBack: true,
};

const nesting = nest(build(REFERENCE));

const LABELS = {
  title: 'Plan de découpe — Bibliothèque (côté « atelier »)',
  panel: (_panel: unknown, index: number, total: number) =>
    `Panneau ${index} / ${total}`,
  part: (placement: { sizeXMm: number; sizeYMm: number }) =>
    `${placement.sizeXMm} × ${placement.sizeYMm}`,
};

function decode(pdf: Uint8Array): string {
  return [...pdf].map((byte) => String.fromCharCode(byte)).join('');
}

describe('PDF', () => {
  const pdf = cutPlanPdf(nesting, LABELS);
  const text = decode(pdf);

  it('commence par un en-tête PDF et finit par un marqueur de fin', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('déclare une page par panneau', () => {
    const pages = [...text.matchAll(/\/Type \/Page[^s]/g)].length;

    expect(pages).toBe(nesting.panels.length);
  });

  it('annonce des longueurs de flux exactes, en octets', () => {
    // Un `/Length` faux, et le lecteur affiche une page blanche sans rien dire. Le
    // français a des accents : les compter comme des caractères UTF-8 casserait le
    // fichier.
    for (const match of text.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
      const start = (match.index ?? 0) + match[0].length;
      const end = text.indexOf('\nendstream', start);

      expect(end - start).toBe(Number(match[1]));
    }
  });

  it('place les décalages de la table des références sur de vrais objets', () => {
    // Le xref est ce qui rend un PDF lisible : un décalage faux et rien ne s'ouvre.
    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
      Number(m[1]),
    );

    expect(offsets.length).toBeGreaterThan(0);
    for (const [index, offset] of offsets.entries()) {
      expect(text.slice(offset)).toMatch(new RegExp(`^${index + 1} 0 obj`));
    }

    const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(startxref)).toMatch(/^xref/);
  });

  it('échappe les parenthèses, qui délimitent les chaînes PDF', () => {
    // « côté « atelier » » du titre contient des guillemets, pas de parenthèses : on en
    // met explicitement.
    const withParenthesis = renderPdf({
      title: 'Projet (brouillon)',
      pages: [{ widthPt: 100, heightPt: 100, shapes: [] }],
    });

    expect(decode(withParenthesis)).toContain('Projet \\(brouillon\\)');
  });

  it('est déterministe — deux exports identiques, octet pour octet', () => {
    // C'est ce qui donne un sens à l'instantané figé : le même projet exporté deux fois
    // ne doit pas produire deux fichiers différents.
    expect(cutPlanPdf(nesting, LABELS)).toEqual(pdf);
  });

  it('ne laisse aucune pièce sortir de la page', () => {
    const numbers = [...text.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re/g)];

    expect(numbers.length).toBeGreaterThan(0);
    for (const [, x, y, width, height] of numbers) {
      expect(Number(x) + Number(width)).toBeLessThanOrEqual(842);
      expect(Number(y) + Number(height)).toBeLessThanOrEqual(596);
    }
  });

  it('suit la taille de papier demandée', () => {
    const letter = decode(cutPlanPdf(nesting, LABELS, 'letter'));

    expect(letter).toContain('/MediaBox [0 0 792 612]');
    expect(text).toContain('/MediaBox [0 0 841.89 595.28]');
  });
});

describe('SVG', () => {
  const panel = nesting.panels[0]!;
  const svg = cutPlanSvg(panel, LABELS);

  it('dessine en millimètres, sans échelle intermédiaire', () => {
    // Les cotes du plan sont les coordonnées du dessin : une erreur d'échelle se voit.
    expect(svg).toContain(
      `viewBox="0 0 ${panel.format.lengthMm} ${panel.format.widthMm}"`,
    );
  });

  it('dessine chaque pièce placée', () => {
    const rectangles = [...svg.matchAll(/<rect /g)].length;

    // Un rectangle par pièce, plus celui du panneau.
    expect(rectangles).toBe(panel.placements.length + 1);
  });

  it('échappe ce qui casserait le XML', () => {
    const dangerous = cutPlanSvg(panel, {
      ...LABELS,
      part: () => '<script>alert("x")</script>',
    });

    expect(dangerous).not.toContain('<script>');
    expect(dangerous).toContain('&lt;script&gt;');
  });
});
