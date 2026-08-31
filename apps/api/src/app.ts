import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { success, type ApiError } from '@neftya/contracts';
import { sql, type Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import { HttpError, sendError } from './http/errors.js';
import { ManufacturingRepository } from './manufacturing/repository.js';
import { registerManufacturingRoutes } from './manufacturing/routes.js';
import { ProjectRepository } from './projects/repository.js';
import { registerProjectRoutes } from './projects/routes.js';
import { SettingsRepository } from './settings/repository.js';
import { registerSettingsRoutes } from './settings/routes.js';
import {
  jsonSink,
  logFailure,
  readiness,
  registerLogging,
  type LogSink,
} from './observability/logging.js';
import { makeAuthenticator } from './sekuu/authenticate.js';
import type { SekuuStorage } from './sekuu/storage.js';
import type { TokenVerifier } from './sekuu/token-verifier.js';

/**
 * L'application, séparée du serveur : les tests l'instancient et l'interrogent par
 * `inject()`, sans ouvrir de port.
 *
 * Les dépendances sont injectées plutôt qu'importées comme singletons — c'est ce qui
 * permet aux tests de signer leurs propres jetons, sans réseau ni compte de plateforme.
 */
export interface AppDependencies {
  db: Kysely<Database>;
  verifier: TokenVerifier;
  /** Absent tant qu'aucune clé d'API n'est configurée : l'export reste possible, sans dépôt. */
  storage?: SekuuStorage;
  /** Injectable : les tests lisent ce qui a été journalisé au lieu de le voir passer. */
  logSink?: LogSink;
  /**
   * Origines autorisées à appeler l'API depuis un navigateur.
   *
   * Une **liste**, jamais `*` : l'API porte un jeton dans un en-tête, et une origine
   * quelconque autorisée à l'envoyer est une page quelconque qui agit au nom de
   * l'utilisateur. C'est la même liste que celle de la plateforme, et pour la même raison.
   */
  allowedOrigins?: readonly string[];
}

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const sink = dependencies.logSink ?? jsonSink;
  // Le journal de Fastify est désactivé au profit du nôtre : deux formats de journal dans
  // le même flux obligent à écrire deux requêtes pour chercher une seule chose.
  const app = Fastify({ logger: false, genReqId: () => crypto.randomUUID() });

  registerLogging(app, { sink });

  // L'interface vit sur une autre origine que l'API — en développement comme en production.
  // Sans cet en-tête, le navigateur refuse la réponse avant même que le code la voie, et le
  // symptôme ne ressemble en rien à sa cause.
  const allowedOrigins = dependencies.allowedOrigins ?? [];

  void app.register(cors, {
    origin: (origin, callback) => {
      // Pas d'origine : un appel serveur à serveur, curl, une sonde. Rien à refuser.
      if (!origin) {
        callback(null, true);
        return;
      }

      // Une origine inconnue reçoit une réponse sans en-tête, pas une erreur : c'est au
      // navigateur de refuser, et c'est ce qu'il fait.
      callback(null, allowedOrigins.includes(origin));
    },
    credentials: true,
  });

  // Vivant : le processus répond. N'interroge rien — une sonde de vie qui dépend de la
  // base fait redémarrer une application qui va bien parce que la base tousse.
  app.get('/health', async () => success({ status: 'ok' }));

  // Prêt : la base répond. C'est la sonde qui décide d'envoyer du trafic, ou non.
  app.get('/ready', async (_request, reply) => {
    const report = await readiness(async () => {
      await sql`SELECT 1`.execute(dependencies.db);
    });

    return reply.status(report.status === 'ok' ? 200 : 503).send(success(report));
  });

  // Toutes les routes métier passent par l'authentification. Elle est posée une fois, sur
  // un contexte encapsulé, plutôt que répétée route par route : une garde qu'on doit
  // penser à écrire est une garde qu'on finit par oublier une fois.
  app.register(async (authenticated) => {
    authenticated.addHook('preHandler', makeAuthenticator(dependencies.verifier));

    const projects = new ProjectRepository(dependencies.db);
    const settings = new SettingsRepository(dependencies.db);
    const manufacturing = new ManufacturingRepository(dependencies.db);

    registerProjectRoutes(authenticated, projects);
    registerSettingsRoutes(authenticated, settings);
    registerManufacturingRoutes(authenticated, {
      projects,
      settings,
      manufacturing,
      ...(dependencies.storage ? { storage: dependencies.storage } : {}),
    });
  });

  // Une erreur inattendue est capturée au bord de l'application, jamais laissée
  // remonter telle quelle : le client reçoit l'enveloppe de la plateforme, sans
  // détail interne.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return sendError(request, reply, error.toApiError());
    }

    logFailure(sink, request, error);

    const internal: ApiError = {
      code: 'INTERNAL_ERROR',
      message: 'Une erreur interne est survenue.',
    };
    return sendError(request, reply, internal);
  });

  app.setNotFoundHandler((request, reply) =>
    sendError(request, reply, {
      code: 'NOT_FOUND',
      message: 'Ressource introuvable.',
    }),
  );

  return app;
}
