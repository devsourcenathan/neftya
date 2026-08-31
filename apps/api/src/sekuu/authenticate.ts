import type { FastifyRequest } from 'fastify';
import { forbidden, unauthenticated } from '../http/errors.js';
import type { SekuuContext } from './sekuu-context.js';
import { InvalidSekuuToken, type TokenVerifier } from './token-verifier.js';

/** Le produit auquel l'organisation doit être abonnée pour entrer ici. */
export const NEFTYA_PRODUCT = 'neftya';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Présent dès qu'une route est authentifiée. Le lire est le **seul** moyen d'obtenir
     * l'organisation : ni le corps, ni la requête, ni un en-tête ne peuvent la fournir.
     */
    sekuu?: SekuuContext;
  }
}

export function makeAuthenticator(verifier: TokenVerifier) {
  return async function authenticate(request: FastifyRequest): Promise<void> {
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw unauthenticated();
    }

    let context: SekuuContext;
    try {
      context = await verifier.verify(header.slice('Bearer '.length));
    } catch (error) {
      if (error instanceof InvalidSekuuToken) throw unauthenticated(error.message);
      throw error;
    }

    // Un jeton valide prouve qui appelle, pas ce à quoi il a droit. Une organisation
    // abonnée à un autre produit Sekuu possède un jeton parfaitement signé.
    if (!context.products.includes(NEFTYA_PRODUCT)) {
      throw forbidden("Cette organisation n'est pas abonnée à Neftya.");
    }

    request.sekuu = context;
  };
}

/** Lecture non optionnelle : appelée dans une route, l'absence est un défaut de câblage. */
export function sekuuOf(request: FastifyRequest): SekuuContext {
  if (!request.sekuu) {
    throw new Error('Route sans préHandler d’authentification.');
  }
  return request.sekuu;
}
