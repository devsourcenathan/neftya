import Fastify, { type FastifyInstance } from 'fastify';
import { success, type ApiError } from '@neftya/contracts';
import type { Kysely } from 'kysely';
import type { Database } from './db/schema.js';
import { HttpError, sendError } from './http/errors.js';
import { ManufacturingRepository } from './manufacturing/repository.js';
import { registerManufacturingRoutes } from './manufacturing/routes.js';
import { ProjectRepository } from './projects/repository.js';
import { registerProjectRoutes } from './projects/routes.js';
import { SettingsRepository } from './settings/repository.js';
import { registerSettingsRoutes } from './settings/routes.js';
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
}

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false, genReqId: () => crypto.randomUUID() });

  app.get('/health', async () => success({ status: 'ok' }));

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

    request.log.error(error);
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
