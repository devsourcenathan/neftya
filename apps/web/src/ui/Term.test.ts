import { describe, it, expect } from 'vitest';
import fr from '../locales/fr.json' with { type: 'json' };
import en from '../locales/en.json' with { type: 'json' };

/**
 * Le glossaire.
 *
 * Ce qui peut casser ici n'est pas le composant — c'est le catalogue. Un mot qui perd sa
 * définition continue de s'afficher souligné en pointillés et ne répond plus au doigt :
 * `Term` retombe alors sur le mot nu, ce qui est le bon comportement mais efface la
 * promesse. Mieux vaut le savoir au test qu'à l'établi.
 */

const terms = Object.keys(fr.glossaryTerm);

describe('le catalogue de mots', () => {
  it('donne une définition à chaque mot, dans les deux langues', () => {
    const missing: string[] = [];

    for (const term of terms) {
      if (!(term in fr.glossary)) missing.push(`fr:${term}`);
      if (!(term in en.glossary)) missing.push(`en:${term}`);
      if (!(term in en.glossaryTerm)) missing.push(`en:terme:${term}`);
    }

    expect(missing).toEqual([]);
  });

  it('ne définit aucun mot qui ne soit nommé', () => {
    // Une définition sans mot ne s'affiche jamais : elle se maintient pour rien, et finit
    // par décrire un article que le catalogue ne vend plus.
    const orphans = Object.keys(fr.glossary).filter((key) => !terms.includes(key));

    expect(orphans).toEqual([]);
  });

  it('explique sans se contenter de renommer', () => {
    /*
     * « Chant : le chant d'un panneau » n'apprend rien. Une définition tient en une phrase
     * complète, et elle est sensiblement plus longue que le mot — c'est le seul contrôle
     * automatique possible sur du texte, et il attrape le copier-coller.
     */
    const tooShort = Object.entries(fr.glossary)
      .filter(([, definition]) => definition.length < 60)
      .map(([key]) => key);

    expect(tooShort).toEqual([]);
  });
});
