import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

/**
 * Les frontières sont vérifiées automatiquement, pas par la discipline.
 *
 * Chez DealerOS la discipline a tenu trente-neuf fois sur quarante, et la quarantième
 * était une écriture cross-tenant. Une règle d'architecture qui n'est pas testée est une
 * intention.
 *
 * @see docs/ENGINEERING.md §3
 * @see docs/ARCHITECTURE.md
 */

/** Ce que chaque paquet a le droit d'importer de l'espace `@neftya/`. */
const ALLOWED: Record<string, readonly string[]> = {
  '@neftya/engine': [],
  '@neftya/contracts': ['@neftya/engine'],
  // Les unités sont de l'affichage et de la saisie : elles connaissent le moteur, jamais
  // l'inverse. Un moteur qui manipulerait des pouces perdrait l'invariant de recomposition.
  '@neftya/units': ['@neftya/engine'],
  // Les dessins connaissent le placement et les formats de papier, rien d'autre : ni
  // requête, ni base, ni composant.
  '@neftya/drawing': ['@neftya/engine', '@neftya/units'],
  '@neftya/api': [
    '@neftya/engine',
    '@neftya/contracts',
    '@neftya/units',
    '@neftya/drawing',
  ],
  '@neftya/web': [
    '@neftya/engine',
    '@neftya/contracts',
    '@neftya/units',
    '@neftya/drawing',
  ],
};

const WORKSPACES: Record<string, string> = {
  '@neftya/engine': 'packages/engine',
  '@neftya/contracts': 'packages/contracts',
  '@neftya/units': 'packages/units',
  '@neftya/drawing': 'packages/drawing',
  '@neftya/api': 'apps/api',
  '@neftya/web': 'apps/web',
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return ['.ts', '.tsx'].includes(extname(full)) ? [full] : [];
  });
}

function neftyaImports(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/from\s+'(@neftya\/[a-z]+)/g)].map((m) => m[1] as string);
}

describe('frontières entre paquets', () => {
  for (const [pkg, allowed] of Object.entries(ALLOWED)) {
    it(`${pkg} n'importe que ce qu'il a le droit d'importer`, () => {
      const violations: string[] = [];

      for (const file of sourceFiles(join(WORKSPACES[pkg] as string, 'src'))) {
        for (const imported of neftyaImports(file)) {
          if (imported !== pkg && !allowed.includes(imported)) {
            violations.push(`${file} importe ${imported}`);
          }
        }
      }

      expect(violations).toEqual([]);
    });
  }

  it('le moteur ne dépend que de zod', () => {
    // Le moteur est pur : ni framework, ni base, ni réseau. zod est de la validation,
    // pas une entrée-sortie, et le garder ici évite que le schéma et le calcul dérivent.
    const manifest = JSON.parse(
      readFileSync('packages/engine/package.json', 'utf8'),
    ) as { dependencies?: Record<string, string> };

    expect(Object.keys(manifest.dependencies ?? {})).toEqual(['zod']);
  });

  it("le moteur n'effectue aucune entrée-sortie", () => {
    // Déterminisme : même entrée, même sortie, toujours. Sans quoi il ne peut pas
    // tourner à la fois dans le navigateur et sur le serveur avec le même résultat.
    const forbidden = [
      /\bDate\.now\s*\(/,
      /\bnew Date\s*\(\s*\)/,
      /\bMath\.random\s*\(/,
      /\bfetch\s*\(/,
      /\bprocess\.env\b/,
      /from\s+'node:/,
    ];

    const violations: string[] = [];

    for (const file of sourceFiles('packages/engine/src')) {
      if (file.endsWith('.test.ts')) continue;
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        if (pattern.test(source)) violations.push(`${file} : ${pattern}`);
      }
    }

    expect(violations).toEqual([]);
  });
});

/**
 * Une construction qui ne tient que grâce aux restes de la précédente.
 *
 * `apps/web` dépendait de `@neftya/drawing` sans le **référencer** dans son `tsconfig`.
 * `tsc --build` ne le construisait donc pas : en local ça passait, parce que
 * `packages/drawing/dist` traînait d'un `npm run build` à la racine. Sur un hébergeur, qui
 * part d'un dépôt propre et construit l'interface seule, les déclarations manquaient — et
 * `VIEWS` ou `technicalDrawing` devenaient `any`, ce qui fait tomber `noImplicitAny` sur des
 * lignes qui n'ont rien à voir.
 *
 * C'est le piège du `dist` périmé, dans l'autre sens : un artefact qui traîne fait passer un
 * graphe de construction faux.
 */
describe('le graphe de construction', () => {
  const apps = ['apps/api', 'apps/web'];

  for (const app of apps) {
    it(`${app} référence tous les paquets dont il dépend`, () => {
      const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
      };

      // Les commentaires sont admis dans un `tsconfig`, et `JSON.parse` ne les lit pas.
      const config = JSON.parse(
        readFileSync(join(app, 'tsconfig.json'), 'utf8').replace(
          /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
          '',
        ),
      ) as { references?: { path: string }[] };

      const referenced = new Set(
        (config.references ?? []).map((reference) => reference.path.split('/').pop()),
      );

      for (const name of Object.keys(manifest.dependencies ?? {})) {
        if (!name.startsWith('@neftya/')) continue;

        expect(
          referenced.has(name.replace('@neftya/', '')),
          `${app} dépend de ${name} sans le référencer : sa construction ne tiendra que tant qu'un dist traîne`,
        ).toBe(true);
      }
    });
  }
});

/**
 * Le projet des tests se construit à part, et ne se référence pas depuis la racine.
 *
 * `tsconfig.tests.json` est le seul projet désigné par un **fichier** et non par un
 * dossier. Référencé depuis `tsconfig.json`, le transformateur de Vite (oxc) résolvait ce
 * chemin relativement au fichier qu'il compilait : pour
 * `packages/drawing/dist/index.js`, il cherchait `packages/tsconfig.tests.json`, ne le
 * trouvait pas, et refusait de servir le module. Le serveur de développement ne rendait
 * plus qu'un écran d'erreur — sur une page qui n'a rien à voir avec les tests.
 *
 * On le garde donc hors de la solution racine, et `npm run typecheck` nomme les deux
 * solutions : sans quoi plus personne ne vérifierait les types des tests.
 */
describe('le projet des tests', () => {
  const withoutComments = (path: string) =>
    readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

  it("n'est pas référencé par la solution racine", () => {
    const config = JSON.parse(withoutComments('tsconfig.json')) as {
      references?: { path: string }[];
    };

    const paths = (config.references ?? []).map((reference) => reference.path);

    expect(
      paths.some((path) => path.endsWith('.json')),
      'un projet désigné par un fichier dans tsconfig.json : le serveur de développement cassera sur une page sans rapport',
    ).toBe(false);
  });

  it('reste couvert par la vérification des types', () => {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(manifest.scripts.typecheck).toContain('tsconfig.tests.json');
  });
});
