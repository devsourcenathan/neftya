import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet, type JWK } from 'jose';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { Database } from '../db/schema.js';
import type { LogSink } from '../observability/logging.js';
import type { SekuuAI } from '../sekuu/ai.js';
import type { FileStore, Uploader } from '../storage/file-store.js';
import { TokenVerifier } from '../sekuu/token-verifier.js';
import { LocalFileStore } from '../storage/local-store.js';
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
  /** La langue portée par le jeton, celle à laquelle les noms de donnée sont résolus. */
  language?: string;
}

export interface HarnessOptions {
  /** Recueille les journaux au lieu de les laisser passer sur la sortie standard. */
  logSink?: LogSink;
  /** Origines navigateur admises. Vide par défaut, comme en production. */
  allowedOrigins?: readonly string[];
  /**
   * L'assistant. **Absent par défaut**, comme sur une installation sans clé.
   *
   * C'est le bon défaut : la plupart des tests n'en veulent pas, et celui qui vérifie qu'un
   * assistant non configuré le dit n'aurait rien à vérifier si le banc d'essai en fournissait
   * un d'office.
   */
  ai?: SekuuAI;
  /**
   * Dépôt des exports. `'local'` branche le magasin sur disque (répertoire
   * temporaire, nettoyé à la fermeture) **avec** sa relecture : c'est le
   * montage de production, pas un doublon assemblé à la main.
   */
  storage?: Uploader | 'local';
  /** Relecture des fichiers déposés. Absente par défaut : le téléchargement rend 404. */
  files?: Pick<FileStore, 'download'>;
  /**
   * Secret HS256 des jetons locaux. Fourni par défaut pour que les routes
   * `/v1/auth/*` soient montées dans tous les tests — sans lui, elles ne
   * le seraient pas, et chaque test d'auth devrait le réclamer.
   */
  jwtSecret?: string;
}

/**
 * La base sur laquelle la suite travaille — ou un refus.
 *
 * Il y avait ici un repli sur `localhost:5442`, le port de `docker compose`. Un repli sur
 * une adresse plausible ne protège de rien : le jour où la variable a cessé d'arriver
 * jusqu'aux tests, ils ont continué à composer un numéro au lieu de dire qu'ils n'en
 * avaient pas, et le défaut a tenu un mois sous un port qui répondait par hasard.
 *
 * Mieux vaut refuser. Une suite qui ne sait pas où elle écrit ne doit pas écrire.
 */
export function connectionString(): string {
  const value = process.env['DATABASE_URL'];
  if (!value) {
    throw new Error(
      "DATABASE_URL manquante : le banc d'essai ne devine pas sur quelle base travailler. " +
        "La renseigner dans `.env` à la racine, ou dans l'environnement — " +
        'voir README.md, « Démarrer ».',
    );
  }
  return value;
}

export async function createHarness(
  schema: string,
  options: HarnessOptions = {},
): Promise<Harness> {
  const connection = connectionString();

  const admin = new pg.Pool({ connectionString: connection, max: 1 });
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();

  const pool = new pg.Pool({
    connectionString: connection,
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

  let dataDir: string | null = null;
  let storage =
    options.storage && typeof options.storage !== 'string'
      ? options.storage
      : undefined;
  let files = options.files;
  if (options.storage === 'local') {
    dataDir = mkdtempSync(join(tmpdir(), `neftya-${schema}-`));
    const store = new LocalFileStore({ dataDir, db });
    storage = store;
    files = store;
  }

  const app = buildApp({
    db,
    // Sans puits injecté, les tests écriraient des milliers de lignes JSON dans la sortie
    // de la suite, où personne ne les lirait.
    logSink: options.logSink ?? (() => {}),
    ...(options.allowedOrigins ? { allowedOrigins: options.allowedOrigins } : {}),
    ...(options.ai ? { ai: options.ai } : {}),
    ...(storage ? { storage } : {}),
    ...(files ? { files } : {}),
    jwtSecret: options.jwtSecret ?? 'secret-de-test-32-caracteres-minimum',
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
      lang: options.language ?? 'fr',
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
      await sql`TRUNCATE projects, organization_settings, material_prices, project_exports, templates, refresh_sessions, invitations, memberships, organization_quotas, organizations, users, files CASCADE`.execute(
        db,
      );
    },
    close: async () => {
      await app.close();
      await db.destroy();
      const cleanup = new pg.Pool({ connectionString: connection, max: 1 });
      await cleanup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await cleanup.end();
      if (dataDir) rmSync(dataDir, { recursive: true, force: true });
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
