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

/** Trois essais espacés : assez pour un réveil, trop peu pour masquer une panne. */
export const CONNECT_ATTEMPTS = 3;
const CONNECT_BACKOFF_MS = 250;

/**
 * Un pool qui réessaie **d'ouvrir** une connexion, et rien d'autre.
 *
 * Une base serverless s'endort. Au réveil, plusieurs ouvertures simultanées se font fermer
 * au nez — « Connection terminated unexpectedly » — et la requête rend `500` alors que la
 * base, une seconde plus tard, répond. C'est ce qui s'est produit sur une inscription :
 * trois lectures parallèles, trois ouvertures d'un coup, une de morte, et un `500` au bout
 * de cent secondes.
 *
 * **Le réessai ne porte jamais sur la requête.** Rejouer une écriture dont on ne sait pas
 * si elle a abouti est le genre de remède qui crée deux projets ; ouvrir une connexion,
 * en revanche, n'a aucun effet de bord.
 */
export function withConnectRetry<T extends { connect: (...args: never[]) => unknown }>(
  pool: T,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): T {
  const open = pool.connect.bind(pool) as (...args: unknown[]) => unknown;

  const retrying = async (): Promise<unknown> => {
    let last: unknown;

    for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt += 1) {
      try {
        return await open();
      } catch (error) {
        last = error;
        if (attempt < CONNECT_ATTEMPTS) await sleep(CONNECT_BACKOFF_MS * attempt);
      }
    }

    throw last;
  };

  /*
   * **La forme à rappel passe telle quelle.**
   *
   * `pool.query()` appelle `connect(callback)` par-dessous. Une enveloppe qui ignore ce
   * rappel laisse le pool attendre indéfiniment, et c'est exactement ce qui s'est produit :
   * chaque `beforeAll` du banc d'essai dépassait son délai de trente secondes, sur tous les
   * fichiers à la fois. Réécrire ce chemin demanderait de reproduire `(err, client, done)`
   * fidèlement — pour un gain nul, puisque le réessai a déjà lieu là où les connexions
   * s'ouvrent en rafale.
   */
  pool.connect = ((...args: unknown[]) =>
    args.length > 0 ? open(...args) : retrying()) as T['connect'];

  return pool;
}

export function createDatabase(connectionString: string): Kysely<Database> {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    // Sur une base distante, une connexion refermée au bout de dix secondes d'inactivité
    // est une connexion à rouvrir à chaque accalmie — et chaque réouverture paie le
    // réveil. `keepAlive` tient le canal ouvert au niveau TCP.
    keepAlive: true,
    connectionTimeoutMillis: 20_000,
  });

  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: withConnectRetry(pool) }),
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
