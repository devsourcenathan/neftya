import { HTTP_STATUS, failure, type ApiError, type ErrorCode } from '@neftya/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Les erreurs métier remontent comme exceptions et sont traduites en un seul endroit.
 *
 * Un contrôleur qui écrit lui-même `reply.status(403)` finit par en écrire un `404` ici et
 * un `403` là pour le même refus. Le statut se déduit du code, une seule fois, dans
 * `HTTP_STATUS`.
 */
export class HttpError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  toApiError(): ApiError {
    return this.details
      ? { code: this.code, message: this.message, details: this.details }
      : { code: this.code, message: this.message };
  }
}

export const unauthenticated = (message = 'Authentification requise.') =>
  new HttpError('UNAUTHENTICATED', message);

export const forbidden = (message = 'Cette action ne vous est pas permise.') =>
  new HttpError('FORBIDDEN', message);

/**
 * Sert aussi bien à « n'existe pas » qu'à « appartient à une autre organisation ».
 *
 * C'est délibéré : répondre `403` sur une ressource d'autrui confirmerait son existence à
 * qui essaie des identifiants au hasard.
 *
 * @see docs/SEKUU.md §4
 */
export const notFound = (message = 'Ressource introuvable.') =>
  new HttpError('NOT_FOUND', message);

export const conflict = (message: string) => new HttpError('CONFLICT', message);

export const validationFailed = (details: Record<string, string[]>) =>
  new HttpError('VALIDATION_ERROR', 'Les données envoyées sont invalides.', details);

export function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: ApiError,
): FastifyReply {
  return reply
    .status(HTTP_STATUS[error.code])
    .send(failure(error, { request_id: request.id }));
}
