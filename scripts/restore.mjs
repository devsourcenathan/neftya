#!/usr/bin/env node
/**
 * Restaure une sauvegarde.
 *
 *   node scripts/restore.mjs <fichier> [--clean]
 *
 * `--clean` efface ce qui existe avant de restaurer. Ce n'est **pas** le défaut : une
 * restauration destructive lancée par erreur sur la production est le genre d'accident
 * qu'un défaut ne doit pas rendre facile.
 *
 * @see docs/OPERATIONS.md §5
 */
import { restore, toolsAvailable } from '../apps/api/dist/db/backup.js';

const connectionString = process.env.DATABASE_URL;
const file = process.argv[2];
const clean = process.argv.includes('--clean');

if (!connectionString || !file) {
  console.error(
    'Usage : DATABASE_URL=... node scripts/restore.mjs <fichier> [--clean]',
  );
  process.exit(1);
}

if (!(await toolsAvailable())) {
  console.error('pg_restore est introuvable : installer le client PostgreSQL 18.');
  process.exit(1);
}

if (clean) {
  console.error(`Restauration DESTRUCTIVE de ${file} vers la base cible.`);
}

await restore({ connectionString, file, clean });

console.log('Restauré.');
