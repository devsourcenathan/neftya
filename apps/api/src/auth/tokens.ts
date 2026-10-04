import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { InvalidSekuuToken } from '../sekuu/token-verifier.js';
import type { SekuuContext } from '../sekuu/sekuu-context.js';

/**
 * Jetons locaux Neftya.
 *
 * Deux natures, deux durées, deux révocabilités :
 * - accès : JWT HS256, 15 minutes, non révoquable — c'est la fenêtre
 *   d'exposition, à ne pas allonger (voir OPERATIONS.md §7) ;
 * - rafraîchissement : opaque, 30 jours, révoquable, à rotation.
 *   Le rejouement d'un jeton déjà tourné révoque toute la session.
 *
 * Le contexte rendu a la **même forme** que celui de Sekuu : les routes
 * (`sekuuOf`, `can`, `enforceLimit`) n'ont pas à savoir qui a signé.
 */

export const LOCAL_ISSUER = 'neftya';
export const LOCAL_AUDIENCE = 'neftya-api';
export const ACCESS_TTL_SECONDS = 900;
export const REFRESH_TTL_SECONDS = 30 * 24 * 3600;

export interface AccessClaims {
  userId: string;
  organizationId: string | null;
  roles: readonly string[];
  language: string;
}

export async function signAccess(
  secret: string,
  claims: AccessClaims,
): Promise<{ token: string; expiresIn: number }> {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    org: claims.organizationId,
    roles: [...claims.roles],
    products: ['neftya'],
    limits: {},
    lang: claims.language,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuer(LOCAL_ISSUER)
    .setAudience(LOCAL_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TTL_SECONDS)
    .sign(new TextEncoder().encode(secret));

  return { token, expiresIn: ACCESS_TTL_SECONDS };
}

export async function verifyAccess(
  secret: string,
  token: string,
): Promise<SekuuContext> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: LOCAL_ISSUER,
      audience: LOCAL_AUDIENCE,
      algorithms: ['HS256'],
    }));
  } catch (error) {
    throw new InvalidSekuuToken(
      error instanceof Error ? error.message : 'vérification impossible',
    );
  }

  const subject = payload.sub;
  if (typeof subject !== 'string' || subject.length === 0) {
    throw new InvalidSekuuToken('aucun sujet');
  }
  const organizationId = payload['org'];
  if (typeof organizationId !== 'string' || organizationId.length === 0) {
    throw new InvalidSekuuToken('aucune organisation active');
  }

  const roles = Array.isArray(payload['roles'])
    ? payload['roles'].filter(
        (role): role is 'owner' | 'admin' | 'member' =>
          role === 'owner' || role === 'admin' || role === 'member',
      )
    : [];

  return {
    userId: subject,
    organizationId,
    roles,
    products: ['neftya'],
    limits: {},
    sessionId: null,
    language: typeof payload['lang'] === 'string' ? payload['lang'] : 'fr',
  };
}

/** Jeton opaque : 256 bits, encodés en hexadécimal. */
export function newRefreshToken(): string {
  return randomBytes(32).toString('hex');
}

/** Condensat stocké : SHA-256 hex. Le secret ne dort jamais en base. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
