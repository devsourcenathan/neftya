#!/usr/bin/env node
/**
 * Sauvegarde la base dans un fichier daté.
 *
 *   node scripts/backup.mjs [répertoire]
 *
 * Le va-et-vient complet — sauvegarder, détruire, restaurer — est joué par
 * `apps/api/src/db/backup.test.ts` à chaque exécution de la suite. Ce script n'est que la
 * commande ; la preuve qu'elle fonctionne est ailleurs, et elle tourne.
 *
 * @see docs/OPERATIONS.md §5
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { backup, toolsAvailable } from '../apps/api/dist/db/backup.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL manquante.');
  process.exit(1);
}

if (!(await toolsAvailable())) {
  console.error(
    "pg_dump est introuvable. Sans lui, aucune sauvegarde n'est possible : installer le client PostgreSQL 18.",
  );
  process.exit(1);
}

const directory = process.argv[2] ?? 'sauvegardes';
mkdirSync(directory, { recursive: true });

// Horodatage en UTC, secondes comprises : deux sauvegardes de la même minute ne doivent
// pas s'écraser l'une l'autre.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = join(directory, `neftya-${stamp}.dump`);

await backup({ connectionString, file });

console.log(file);
