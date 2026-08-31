#!/usr/bin/env node
/**
 * Échoue quand les traductions dérivent, ou qu'un texte est écrit en dur.
 *
 * Quatre contrôles :
 *
 *  1. fr.json et en.json définissent exactement les mêmes clés.
 *  2. Toute clé demandée par un composant existe.
 *  3. `t()` ne reçoit jamais de valeur par défaut — c'est ce second argument qui a
 *     masqué 76 % de clés manquantes sur DealerOS pendant des mois.
 *  4. Aucun texte lisible n'est écrit en dur dans du JSX.
 *
 * Les clés dynamiques (`t(`orders.status.${x}`)`) sont vérifiées par préfixe : au moins
 * une clé existante doit commencer par la partie littérale.
 *
 * @see docs/I18N.md §7
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const SRC = 'apps/web/src';
const LOCALES_DIR = join(SRC, 'locales');
const LOCALES = ['fr', 'en'];

/** Une ligne portant ce marqueur échappe au contrôle de texte en dur. */
const EXEMPT = 'i18n-exempt';

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function flatten(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'object' && value !== null ? flatten(value, path) : [path];
  });
}

const bundles = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    new Set(
      flatten(JSON.parse(readFileSync(join(LOCALES_DIR, `${locale}.json`), 'utf8'))),
    ),
  ]),
);

const problems = [];

// 1. Parité entre locales.
for (const a of LOCALES) {
  for (const b of LOCALES) {
    if (a === b) continue;
    for (const key of bundles[a]) {
      if (!bundles[b].has(key)) {
        problems.push(`${key} : présente dans ${a}, absente de ${b}`);
      }
    }
  }
}

const reference = bundles[LOCALES[0]];

const files = walk(SRC).filter(
  (file) => ['.ts', '.tsx'].includes(extname(file)) && !file.endsWith('i18n.ts'),
);

const literalKey = /(?<![\w$.])t\(\s*'([^']+)'/g;
const templateKey = /(?<![\w$.])t\(\s*`([^`$]*)\$\{/g;
const withFallback = /(?<![\w$.])t\(\s*'[^']+'\s*,\s*['"`]/g;
// Texte JSX : ce qui sépare deux balises, sans accolade, avec au moins trois lettres.
const jsxText = />\s*([^<>{}\n][^<>{}]*?)\s*</g;

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');

  for (const match of source.matchAll(withFallback)) {
    problems.push(
      `${file}:${lineOf(source, match.index)} : t() reçoit une valeur par défaut — le texte va dans locales/`,
    );
  }

  for (const match of source.matchAll(literalKey)) {
    if (!reference.has(match[1])) {
      problems.push(
        `${file}:${lineOf(source, match.index)} : clé inconnue « ${match[1]} »`,
      );
    }
  }

  for (const match of source.matchAll(templateKey)) {
    const prefix = match[1];
    if (![...reference].some((key) => key.startsWith(prefix))) {
      problems.push(
        `${file}:${lineOf(source, match.index)} : aucune clé ne commence par « ${prefix} »`,
      );
    }
  }

  if (!file.endsWith('.tsx')) continue;

  for (const match of source.matchAll(jsxText)) {
    const text = match[1];
    // Au moins trois lettres consécutives : « — », « : » ou « 42 » ne sont pas du texte.
    if (!/\p{L}{3,}/u.test(text)) continue;
    const line = lineOf(source, match.index);
    if (lines[line - 1]?.includes(EXEMPT)) continue;
    problems.push(`${file}:${line} : texte en dur « ${text} » — passer par t()`);
  }
}

if (problems.length > 0) {
  console.error(`Contrôle i18n en échec (${problems.length} problèmes) :\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`i18n : ${reference.size} clés, ${LOCALES.join('/')} à parité.`);
