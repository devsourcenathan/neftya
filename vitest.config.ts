import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Le banc d'essai veut `DATABASE_URL`, et Vitest ne lit pas `.env` de lui-même.
 *
 * Tant que PostgreSQL tournait en local sur le port attendu, le repli du harnais suffisait
 * et le trou ne se voyait pas. Une base distante l'a révélé d'un coup : les douze fichiers
 * qui touchent la base cherchaient `localhost:5442`, qui n'existe plus.
 *
 * **L'environnement réel garde la main.** En CI, c'est lui qui fournit l'URL ; un `.env`
 * oublié sur une machine ne doit pas prendre sa place et faire tourner la suite ailleurs
 * que là où on croit.
 */
const fromFiles = loadEnv('test', process.cwd(), '');
const env = Object.fromEntries(
  Object.entries(fromFiles).filter(([key]) => !(key in process.env)),
);

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    env,
    /**
     * Un banc d'essai rejoue **toutes** les migrations à l'ouverture. Sur une base locale
     * c'est instantané ; sur une base distante, chaque instruction paie un aller-retour, et
     * les cinq secondes par défaut tombent avant la fin — ce qui ferait rendre « échec » à
     * une suite qui n'a rien de cassé.
     *
     * Les deux valeurs restent **courtes devant un blocage réel** : une requête qui ne
     * revient pas échoue toujours, elle met seulement plus longtemps à le dire.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
