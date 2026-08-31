#!/usr/bin/env node
/**
 * Recopie les migrations SQL à côté du code compilé.
 *
 * `tsc` ne connaît que le TypeScript : il ignore les fichiers `.sql`, et le serveur
 * construit démarrait donc en cherchant un répertoire inexistant. Le défaut ne se voyait
 * pas en développement, où le code tourne depuis `src`, ni dans les tests, qui lisent eux
 * aussi `src` — seulement au démarrage d'un vrai déploiement.
 */
import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'src', 'db', 'migrations');
const to = join(root, 'dist', 'db', 'migrations');

if (!existsSync(from)) {
  console.error('Aucune migration à copier : chemin inattendu.');
  process.exit(1);
}

cpSync(from, to, { recursive: true });
