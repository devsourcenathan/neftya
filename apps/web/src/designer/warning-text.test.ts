import { describe, it, expect } from 'vitest';
import i18next from 'i18next';
import { build, tiltHeightMm } from '@neftya/engine';
import fr from '../locales/fr.json' with { type: 'json' };
import en from '../locales/en.json' with { type: 'json' };
import { warningText } from './warning-text.js';

/**
 * Les avertissements chiffrés, tels qu'ils arrivent à l'écran.
 *
 * L'appel passait la clé sans les `details` : l'écran affichait « il lui faut {{tiltMm}} mm
 * pour basculer », accolades comprises. Rien ne pouvait le voir — le moteur rendait les bons
 * nombres, la traduction existait, et le contrôle d'i18n vérifiait que la clé était là. Le
 * trou était entre les deux, et il a fallu regarder l'écran.
 *
 * Ce test est ce qui remplace ce regard.
 */

const translator = (lang: 'fr' | 'en') => {
  const instance = i18next.createInstance();

  void instance.init({
    lng: lang,
    resources: { fr: { translation: fr }, en: { translation: en } },
    interpolation: { escapeValue: false },
  });

  return instance.t.bind(instance);
};

/** Un meuble qui tient debout de justesse et ne peut pas être redressé sur place. */
const furniture = build({
  dimensions: { widthMm: 1000, heightMm: 2000, depthMm: 450 },
  compartments: [{ shelves: 1, drawers: 0 }],
  material: 'mdf',
  hasBack: true,
  space: { heightMm: 2020 },
});

const warning = furniture.warnings.find(
  (candidate) => candidate.code === 'CANNOT_TILT_UP',
);

describe('le texte d’un avertissement', () => {
  it('part bien d’un avertissement chiffré', () => {
    // Sans quoi tout ce qui suit passerait sur un message sans variable.
    expect(warning).toBeDefined();
    expect(fr.warning.CANNOT_TILT_UP).toContain('{{tiltMm}}');
  });

  for (const lang of ['fr', 'en'] as const) {
    it(`remplace ses variables en ${lang}`, () => {
      const text = warningText(translator(lang), warning!);

      expect(text).not.toContain('{{');
      expect(text).toContain(String(tiltHeightMm(2000, 450)));
      expect(text).toContain('2020');
    });
  }
});

describe('les catalogues', () => {
  const variablesOf = (message: string) =>
    [...message.matchAll(/\{\{(\w+)\}\}/gu)].map((match) => match[1]).sort();

  it('demandent les mêmes variables dans les deux langues', () => {
    /*
     * Une traduction qui oublie une variable ne casse rien : elle rend une phrase lisible
     * d'où le chiffre a disparu. « Le plafond est trop bas » sans dire de combien, c'est un
     * avertissement qu'on ne peut pas agir.
     */
    const mismatched: string[] = [];

    for (const [code, message] of Object.entries(fr.warning)) {
      const other = (en.warning as Record<string, string>)[code];
      if (other === undefined) continue;

      const expected = variablesOf(message);
      if (JSON.stringify(variablesOf(other)) !== JSON.stringify(expected)) {
        mismatched.push(code);
      }
    }

    expect(mismatched).toEqual([]);
  });
});
