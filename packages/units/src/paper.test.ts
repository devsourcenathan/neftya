import { describe, it, expect } from 'vitest';
import { PAPER_FORMATS, paperSizeFor } from './paper.js';

describe('taille de papier', () => {
  it('dérive du pays', () => {
    expect(paperSizeFor('FR')).toBe('a4');
    expect(paperSizeFor('CM')).toBe('a4');
    expect(paperSizeFor('US')).toBe('letter');
    // Le Canada aussi : l'oublier ferait dérailler l'échelle sans qu'on comprenne pourquoi.
    expect(paperSizeFor('CA')).toBe('letter');
  });

  it('donne A4 quand le pays suit la plateforme', () => {
    expect(paperSizeFor(null)).toBe('a4');
  });

  it('a des formats distincts — un plan à la mauvaise échelle est un plan faux', () => {
    expect(PAPER_FORMATS.a4).not.toEqual(PAPER_FORMATS.letter);
  });
});
