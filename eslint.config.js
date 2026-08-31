import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/dist-types/**', '**/node_modules/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // `any` désactive le contrôle de types là où on en a le plus besoin. Utiliser
      // `unknown`, puis réduire explicitement. Voir docs/ENGINEERING.md §5.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },
  {
    // Les scripts d'outillage tournent sous Node et parlent à la console : c'est leur
    // interface. Ceux d'un espace de travail comptent autant que ceux de la racine.
    files: ['scripts/**/*.mjs', '*/*/scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['apps/api/src/server.ts'],
    // Le point d'entrée journalise une erreur fatale avant de sortir : il n'y a pas
    // encore de journal structuré à ce moment-là.
    rules: { 'no-console': 'off' },
  },
  prettier,
);
