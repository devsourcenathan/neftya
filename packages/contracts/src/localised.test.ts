import { describe, it, expect } from 'vitest';
import { localisedName, resolveName } from './localised.js';

/**
 * Les noms de donnée métier.
 *
 * La règle qui compte : **une traduction absente affiche le français**, jamais une clé
 * technique. Un menuisier anglophone lit « Meuble TV » et comprend ; il ne comprendrait pas
 * `template.42.name`.
 */

const NAME = { fr: 'Meuble TV', en: 'TV unit' };

describe('résolution', () => {
  it.each([
    ['fr', 'Meuble TV'],
    ['en', 'TV unit'],
  ])('rend le nom de la locale %s', (locale, expected) => {
    expect(resolveName(NAME, locale)).toBe(expected);
  });

  it('accepte une locale régionale', () => {
    // Un jeton qui annonce `en-GB` doit lire l'anglais, pas retomber en français pour un
    // tiret.
    expect(resolveName(NAME, 'en-GB')).toBe('TV unit');
    expect(resolveName(NAME, 'FR-CA')).toBe('Meuble TV');
  });

  it('retombe sur le français pour une langue inconnue', () => {
    expect(resolveName(NAME, 'de')).toBe('Meuble TV');
    expect(resolveName(NAME, '')).toBe('Meuble TV');
  });

  it('retombe sur le français quand la traduction manque', () => {
    // C'est le cas réel : une organisation nomme son modèle en français et ne traduit pas.
    expect(resolveName({ fr: 'Établi' }, 'en')).toBe('Établi');
  });

  it('retombe sur le français quand la traduction est vide', () => {
    // Un champ laissé blanc n'est pas une traduction : afficher du vide serait pire que
    // d'afficher l'autre langue.
    expect(resolveName({ fr: 'Établi', en: '   ' }, 'en')).toBe('Établi');
  });
});

describe('validation', () => {
  it('exige le français', () => {
    // La langue de référence n'est pas facultative : sans elle, il n'y a pas de repli.
    expect(localisedName.safeParse({ en: 'Workbench' }).success).toBe(false);
    expect(localisedName.safeParse({ fr: '   ' }).success).toBe(false);
  });

  it('accepte une langue que le produit ne connaît pas encore', () => {
    // Ajouter l'espagnol ne doit pas demander une migration de schéma.
    const parsed = localisedName.parse({ fr: 'Établi', es: 'Banco de trabajo' });

    expect(resolveName(parsed, 'es')).toBe('Banco de trabajo');
  });

  it('coupe les blancs de bordure', () => {
    expect(localisedName.parse({ fr: '  Établi  ' }).fr).toBe('Établi');
  });
});
