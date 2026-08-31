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
  '@neftya/api': ['@neftya/engine', '@neftya/contracts', '@neftya/units'],
  '@neftya/web': ['@neftya/engine', '@neftya/contracts', '@neftya/units'],
};

const WORKSPACES: Record<string, string> = {
  '@neftya/engine': 'packages/engine',
  '@neftya/contracts': 'packages/contracts',
  '@neftya/units': 'packages/units',
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
