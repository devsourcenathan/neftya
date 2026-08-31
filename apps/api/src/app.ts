import Fastify, { type FastifyInstance } from 'fastify';
import { success, failure, HTTP_STATUS, type ApiError } from '@neftya/contracts';

/**
 * L'application, séparée du serveur : les tests l'instancient et l'interrogent par
 * `inject()`, sans ouvrir de port.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false, genReqId: () => crypto.randomUUID() });

  app.get('/health', async () => success({ status: 'ok' }));

  // Une erreur inattendue est capturée au bord de l'application, jamais laissée
  // remonter telle quelle : le client reçoit l'enveloppe de la plateforme, sans
  // détail interne.
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    return respondWithError(
      reply,
      { code: 'INTERNAL_ERROR', message: 'Une erreur interne est survenue.' },
      request.id,
    );
  });

  app.setNotFoundHandler((request, reply) =>
    respondWithError(
      reply,
      { code: 'NOT_FOUND', message: 'Ressource introuvable.' },
      request.id,
    ),
  );

  return app;
}

function respondWithError(
  reply: Parameters<Parameters<FastifyInstance['setErrorHandler']>[0]>[2],
  error: ApiError,
  requestId: string,
) {
  return reply
    .status(HTTP_STATUS[error.code])
    .send(failure(error, { request_id: requestId }));
}
