import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type { Database } from './schema.js';

/**
 * Connexion et migrations.
 *
 * Les migrations sont du SQL, appliquées dans l'ordre des noms de fichier et enregistrées
 * dans une table. Pas de génération à partir d'un schéma : le DDL est ce qui définit la
 * base, et le lire dans le dépôt doit suffire à savoir ce qu'elle contient.
 */

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export function createDatabase(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString, max: 10 }),
    }),
  });
}

export async function migrate(db: Kysely<Database>): Promise<string[]> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);

  const applied = new Set(
    (
      await sql<{ name: string }>`SELECT name FROM schema_migrations`.execute(db)
    ).rows.map((row) => row.name),
  );

  const pending = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .filter((file) => !applied.has(file));

  for (const file of pending) {
    // Chaque migration est une transaction : une migration à moitié appliquée est pire
    // qu'une migration qui échoue.
    await db.transaction().execute(async (trx) => {
      await sql.raw(readFileSync(join(MIGRATIONS_DIR, file), 'utf8')).execute(trx);
      await sql`INSERT INTO schema_migrations (name) VALUES (${file})`.execute(trx);
    });
  }

  return pending;
}

export type { Database } from './schema.js';
export { sql } from 'kysely';
export type { Kysely } from 'kysely';
