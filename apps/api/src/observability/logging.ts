import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Les journaux.
 *
 * Une ligne par requête, en JSON, avec **de quoi retrouver une requête précise** :
 * `request_id`, l'organisation, l'utilisateur, la route, le statut, la durée. C'est ce qui
 * fait la différence entre « le client dit que ça ne marche pas » et « voici la requête,
 * voici l'erreur ».
 *
 * Ce qui n'y entre **jamais** :
 *
 *  - le jeton, ni aucun en-tête `authorization` ;
 *  - le corps des requêtes — un modèle de meuble n'apprend rien, et un jour un corps
 *    portera autre chose ;
 *  - l'email ou le nom de qui appelle. Neftya ne les détient pas, et les journaux sont
 *    exactement l'endroit où une copie d'utilisateur réapparaît sans que personne ne
 *    l'ait décidé.
 *
 * L'identifiant `sub` de la plateforme, lui, y est : c'est un pseudonyme, il ne dit rien
 * de la personne, et sans lui aucune enquête n'aboutit.
 *
 * @see docs/OPERATIONS.md §3
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  level: LogLevel;
  message: string;
  [field: string]: unknown;
}

export type LogSink = (record: LogRecord) => void;

/**
 * La sortie par défaut : une ligne JSON sur la sortie standard.
 *
 * Pas de fichier, pas de rotation : l'hébergement collecte la sortie standard, et un
 * fichier écrit par l'application est un fichier que personne ne surveille et qui remplit
 * un disque un dimanche.
 */
export const jsonSink: LogSink = (record) => {
  process.stdout.write(`${JSON.stringify(record)}\n`);
};

export interface LoggingOptions {
  sink?: LogSink;
  /** Horloge injectable : les tests ne dépendent pas du temps qui passe. */
  now?: () => number;
  service?: string;
}

/**
 * Branche le journal des requêtes sur l'application.
 *
 * Le champ `duration_ms` est mesuré ici plutôt que déduit d'horodatages : deux horloges
 * qui dérivent donnent des durées négatives, et on ne s'en aperçoit qu'en cherchant autre
 * chose.
 */
export function registerLogging(
  app: FastifyInstance,
  options: LoggingOptions = {},
): void {
  const sink = options.sink ?? jsonSink;
  const now = options.now ?? (() => Date.now());
  const service = options.service ?? 'neftya-api';

  const startedAt = new WeakMap<FastifyRequest, number>();

  app.addHook('onRequest', async (request) => {
    startedAt.set(request, now());
  });

  app.addHook('onResponse', async (request, reply) => {
    const began = startedAt.get(request);

    sink({
      level:
        reply.statusCode >= 500 ? 'error' : reply.statusCode >= 400 ? 'warn' : 'info',
      message: 'requête',
      service,
      request_id: request.id,
      method: request.method,
      // La route déclarée, pas l'URL : `/v1/projects/:id` regroupe, `/v1/projects/<uuid>`
      // fait mille lignes distinctes dont aucune n'est comptable.
      route: request.routeOptions?.url ?? request.url,
      status: reply.statusCode,
      duration_ms: began === undefined ? null : now() - began,
      ...actorOf(request),
    });
  });
}

/**
 * Journalise une erreur inattendue.
 *
 * La pile est conservée : sans elle, une erreur interne dit qu'il s'est passé quelque
 * chose, pas où. Le message rendu au client, lui, reste muet — c'est deux publics
 * différents.
 */
export function logFailure(
  sink: LogSink,
  request: FastifyRequest,
  error: unknown,
  service = 'neftya-api',
): void {
  sink({
    level: 'error',
    message: 'erreur non rattrapée',
    service,
    request_id: request.id,
    method: request.method,
    route: request.routeOptions?.url ?? request.url,
    error_name: error instanceof Error ? error.name : typeof error,
    error_message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
    ...actorOf(request),
  });
}

function actorOf(request: FastifyRequest): Record<string, string | null> {
  const context = request.sekuu;

  return {
    organization_id: context?.organizationId ?? null,
    // Le `sub` de la plateforme : un pseudonyme, jamais un email ni un nom.
    user_id: context?.userId ?? null,
    // La session sert à journaliser, jamais à autoriser.
    session_id: context?.sessionId ?? null,
  };
}

/** Une réponse de sonde : ce qui va, ce qui ne va pas, et rien d'autre. */
export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: Record<string, 'ok' | 'ko'>;
}

/**
 * La sonde de vie répond toujours ; la sonde de disponibilité interroge la base.
 *
 * Les deux sont distinctes parce qu'elles servent à deux décisions opposées : redémarrer
 * le processus, ou cesser de lui envoyer du trafic. Une base momentanément indisponible ne
 * doit pas faire redémarrer une application qui va parfaitement bien.
 */
export async function readiness(check: () => Promise<void>): Promise<HealthReport> {
  try {
    await check();
    return { status: 'ok', checks: { database: 'ok' } };
  } catch {
    return { status: 'degraded', checks: { database: 'ko' } };
  }
}

export type { FastifyReply };
