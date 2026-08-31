import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet, type JWK } from 'jose';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { Database } from '../db/schema.js';
import type { LogSink } from '../observability/logging.js';
import { TokenVerifier } from '../sekuu/token-verifier.js';
import type { SekuuLimits, SekuuRole } from '../sekuu/sekuu-context.js';

/**
 * Le banc d'essai de l'API.
 *
 * PostgreSQL réel, jamais un substitut en mémoire : `jsonb`, `on conflict` et les
 * contraintes de contrôle n'existent que là. Chaque fichier de test travaille dans son
 * propre schéma, ce qui rend l'exécution en parallèle sûre sans base par test.
 *
 * Les jetons sont signés ici, avec une paire de clés fabriquée pour l'occasion : la
 * vérification hors ligne se teste sans réseau, et sans compte Sekuu.
 */

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'db',
  'migrations',
);

const ISSUER = 'https://identity.sekuu.test';
const AUDIENCE = 'sekuu-platform';

export interface Harness {
  app: FastifyInstance;
  db: Kysely<Database>;
  /** Forge un jeton valide. Tout est surchargeable, y compris ce qui doit échouer. */
  token: (options?: TokenOptions) => Promise<string>;
  authorization: (options?: TokenOptions) => Promise<{ authorization: string }>;
  truncate: () => Promise<void>;
  close: () => Promise<void>;
}

export interface TokenOptions {
  organizationId?: string;
  userId?: string;
  roles?: SekuuRole[];
  products?: string[];
  limits?: SekuuLimits;
  /** Pour éprouver les contrôles : un émetteur ou un destinataire qui ne colle pas. */
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  /** Omettre `org` reproduit le jeton d'avant `switch-organization`. */
  omitOrganization?: boolean;
}

export interface HarnessOptions {
  /** Recueille les journaux au lieu de les laisser passer sur la sortie standard. */
  logSink?: LogSink;
  /** Origines navigateur admises. Vide par défaut, comme en production. */
  allowedOrigins?: readonly string[];
}

export async function createHarness(
  schema: string,
  options: HarnessOptions = {},
): Promise<Harness> {
  // Par défaut, ce que `docker compose up` expose. La CI fournit `DATABASE_URL`.
  const connectionString =
    process.env['DATABASE_URL'] ?? 'postgres://neftya:neftya@localhost:5442/neftya';

  const admin = new pg.Pool({ connectionString, max: 1 });
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();

  const pool = new pg.Pool({
    connectionString,
    max: 5,
    options: `-c search_path=${schema}`,
  });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await sql.raw(readFileSync(join(MIGRATIONS_DIR, file), 'utf8')).execute(db);
  }

  const { privateKey, publicKey } = await generateKeyPair('RS256', {
    extractable: true,
  });
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256' };
  const keyStore = createLocalJWKSet({ keys: [jwk] });

  const app = buildApp({
    db,
    // Sans puits injecté, les tests écriraient des milliers de lignes JSON dans la sortie
    // de la suite, où personne ne les lirait.
    logSink: options.logSink ?? (() => {}),
    ...(options.allowedOrigins ? { allowedOrigins: options.allowedOrigins } : {}),
    verifier: new TokenVerifier({
      jwksUrl: 'https://identity.sekuu.test/.well-known/jwks.json',
      issuer: ISSUER,
      audience: AUDIENCE,
      keyStore,
    }),
  });
  await app.ready();

  const token = async (options: TokenOptions = {}): Promise<string> => {
    const payload: Record<string, unknown> = {
      roles: options.roles ?? ['owner'],
      products: options.products ?? ['neftya'],
      limits: options.limits ?? {},
      sid: 'session-de-test',
      lang: 'fr',
    };
    if (!options.omitOrganization) {
      payload['org'] = options.organizationId ?? ORGANIZATION_A;
    }

    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setSubject(options.userId ?? USER_A)
      .setIssuer(options.issuer ?? ISSUER)
      .setAudience(options.audience ?? AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? '15m')
      .sign(privateKey);
  };

  return {
    app,
    db,
    token,
    authorization: async (options) => ({
      authorization: `Bearer ${await token(options)}`,
    }),
    truncate: async () => {
      await sql`TRUNCATE projects, organization_settings, material_prices, project_exports`.execute(
        db,
      );
    },
    close: async () => {
      await app.close();
      await db.destroy();
      const cleanup = new pg.Pool({ connectionString, max: 1 });
      await cleanup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await cleanup.end();
    },
  };
}

export const ORGANIZATION_A = '01924f00-0000-7000-8000-00000000000a';
export const ORGANIZATION_B = '01924f00-0000-7000-8000-00000000000b';
export const USER_A = '01924f00-0000-7000-8000-0000000000a1';
export const USER_B = '01924f00-0000-7000-8000-0000000000b1';

/** Un meuble valide minimal, pour les tests qui ne portent pas sur le moteur. */
export const SAMPLE_MODEL = {
  dimensions: { widthMm: 1800, heightMm: 2000, depthMm: 400 },
  compartments: [
    { shelves: 2, drawers: 0 },
    { shelves: 1, drawers: 1 },
  ],
  material: 'mdf',
  hasBack: true,
} as const;
