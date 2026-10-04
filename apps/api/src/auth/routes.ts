import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import {
  acceptInviteBody,
  createOrganizationBody,
  inviteBody,
  loginBody,
  quotasBody,
  refreshBody,
  registerBody,
  switchOrganizationBody,
  type OrganizationRole,
} from '@neftya/contracts';
import { success } from '@neftya/contracts';
import { randomBytes } from 'node:crypto';
import {
  conflict,
  forbidden,
  notFound,
  unauthenticated,
  validationFailed,
} from '../http/errors.js';
import { sekuuOf } from '../sekuu/authenticate.js';
import {
  hashToken,
  newRefreshToken,
  REFRESH_TTL_SECONDS,
  signAccess,
} from './tokens.js';
import { AI_QUOTA_KEY, PROJECTS_QUOTA_KEY } from '../sekuu/quota.js';
import { hashPassword, verifyPassword } from './password.js';
import type { AuthRepository } from './repository.js';

/**
 * Identité locale : inscription, connexion, sessions, organisations.
 *
 * Routes publiques : `register`, `login`, `refresh`, `logout`, `accept-invitation`.
 * Tout le reste exige un jeton portant `org` — la même frontière que Sekuu,
 * lue au même endroit (`sekuuOf`).
 *
 * Contrôleur mince : valider, déléguer au dépôt, sérialiser. Les règles
 * (un seul owner, invitation à usage unique, rotation avec détection de vol)
 * sont ici, chacune avec son test.
 */

export interface AuthOptions {
  jwtSecret: string;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
/** Compteur en mémoire, par IP : un garde-fou, pas un compteur de facturation. */
const attempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): void {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    throw validationFailed({ _: ['Trop de tentatives. Réessayez dans une minute.'] });
  }
}

export function resetAuthRateLimit(): void {
  attempts.clear();
}

export function registerPublicAuthRoutes(
  app: FastifyInstance,
  repository: AuthRepository,
  options: AuthOptions,
): void {
  app.post('/v1/auth/register', async (request, reply) => {
    checkRateLimit(request.ip);
    const body = parse(registerBody, request.body);

    if (await repository.findUserByEmail(body.email)) {
      throw conflict('Un compte existe déjà avec cette adresse email.');
    }

    const user = await repository.createUser({
      email: body.email,
      passwordHash: await hashPassword(body.password),
      firstName: body.firstName,
      lastName: body.lastName,
    });
    const organization = await repository.createOrganization({
      name: body.organizationName,
      createdBy: user.id,
    });

    const session = await openSession(
      repository,
      options.jwtSecret,
      user.id,
      organization.id,
    );
    return reply.status(201).send(success(session));
  });

  app.post('/v1/auth/login', async (request) => {
    checkRateLimit(request.ip);
    const body = parse(loginBody, request.body);

    const user = await repository.findUserByEmail(body.email);
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      // Même réponse dans les deux cas : ne pas dire si l'email existe.
      throw unauthenticated('Email ou mot de passe incorrect.');
    }

    const memberships = await repository.membershipsOf(user.id);
    const activeId =
      memberships.length === 1 ? (memberships[0]?.organizationId ?? null) : null;
    const session = await openSession(repository, options.jwtSecret, user.id, activeId);
    return success(session);
  });

  app.post('/v1/auth/refresh', async (request) => {
    const body = parse(refreshBody, request.body);
    const presented = hashToken(body.refreshToken);
    const found = await repository.findRefreshSession(presented);

    if (!found || found.expired) {
      throw unauthenticated('Session expirée. Connectez-vous à nouveau.');
    }
    if (found.revoked) {
      // Rejouement d'un jeton déjà tourné : vol probable. Tout révoquer.
      await repository.revokeUserSessions(found.userId);
      throw unauthenticated('Session révoquée. Connectez-vous à nouveau.');
    }

    const next = newRefreshToken();
    await repository.rotateRefreshSession(found.id, {
      userId: found.userId,
      organizationId: found.organizationId,
      tokenHash: hashToken(next),
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
    });

    return success(
      await accessFor(
        repository,
        options.jwtSecret,
        found.userId,
        found.organizationId,
        next,
      ),
    );
  });

  app.post('/v1/auth/logout', async (request) => {
    const body = refreshBody.safeParse(request.body);
    if (body.success) {
      await repository.revokeRefreshSession(hashToken(body.data.refreshToken));
    }
    return success({ loggedOut: true });
  });

  app.post('/v1/auth/accept-invitation', async (request, reply) => {
    checkRateLimit(request.ip);
    const body = parse(acceptInviteBody, request.body);
    const invitation = await repository.consumeInvitation(hashToken(body.token));
    if (!invitation) throw notFound('Invitation invalide ou expirée.');
    if (await repository.findUserByEmail(invitation.email)) {
      throw conflict('Un compte existe déjà avec cette adresse email.');
    }
    const user = await repository.createUser({
      email: invitation.email,
      passwordHash: await hashPassword(body.password),
      firstName: body.firstName,
      lastName: body.lastName,
    });
    await repository.acceptInvitation(invitation.id, user.id);
    const session = await openSession(
      repository,
      options.jwtSecret,
      user.id,
      invitation.organizationId,
    );
    return reply.status(201).send(success(session));
  });
}

/**
 * Routes authentifiées : le jeton porte déjà `org`, et `sekuuOf` le lit au
 * même endroit que pour Sekuu. Aucune route métier ne sait qui a signé.
 */
export function registerProtectedAuthRoutes(
  app: FastifyInstance,
  repository: AuthRepository,
  options: AuthOptions,
): void {
  app.get('/v1/auth/me', async (request) => {
    const context = sekuuOf(request);
    // Deux lectures indépendantes : les enchaîner doublait l'attente pour rien.
    const [memberships, user] = await Promise.all([
      repository.membershipsOf(context.userId),
      repository.findUserById(context.userId),
    ]);
    if (!user) throw unauthenticated();
    return success({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      organizations: memberships.map((membership) => ({
        id: membership.organizationId,
        name: membership.organizationName,
        slug: membership.slug,
        role: membership.role,
      })),
      organizationId: context.organizationId,
    });
  });

  app.post('/v1/auth/organizations', async (request, reply) => {
    const context = sekuuOf(request);
    const body = parse(createOrganizationBody, request.body);
    const organization = await repository.createOrganization({
      name: body.name,
      createdBy: context.userId,
    });
    const session = await openSession(
      repository,
      options.jwtSecret,
      context.userId,
      organization.id,
    );
    return reply.status(201).send(success(session));
  });

  app.post('/v1/auth/switch', async (request) => {
    const context = sekuuOf(request);
    const body = parse(switchOrganizationBody, request.body);
    const role = await repository.roleOf(context.userId, body.organizationId);
    if (!role) throw notFound('Organisation introuvable.');
    const session = await openSession(
      repository,
      options.jwtSecret,
      context.userId,
      body.organizationId,
    );
    return success(session);
  });

  app.post('/v1/auth/invitations', async (request, reply) => {
    const context = sekuuOf(request);
    const role = await repository.roleOf(context.userId, context.organizationId);
    if (role !== 'owner' && role !== 'admin') {
      throw forbidden("Votre rôle ne permet pas d'inviter.");
    }
    const body = parse(inviteBody, request.body);
    const token = randomBytes(32).toString('hex');
    await repository.createInvitation({
      organizationId: context.organizationId,
      email: body.email,
      role: body.role,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      createdBy: context.userId,
    });
    // Le jeton part par email en production (chantier F) ; l'API le rend
    // pour que les tests et l'amorçage n'aient pas à lire la boîte mail.
    return reply.status(201).send(success({ invitationToken: token }));
  });

  app.get('/v1/auth/quotas', async (request) => {
    const context = sekuuOf(request);
    const quotas = await repository.getQuotas(context.organizationId);
    return success({
      projectsMax: quotas?.projectsMax ?? null,
      aiMonthMax: quotas?.aiMonthMax ?? null,
    });
  });

  app.put('/v1/auth/quotas', async (request) => {
    const context = sekuuOf(request);
    const role = await repository.roleOf(context.userId, context.organizationId);
    if (role !== 'owner') {
      throw forbidden('Seul le propriétaire peut modifier les plafonds.');
    }
    const body = parse(quotasBody, request.body);
    const quotas = await repository.saveQuotas(context.organizationId, {
      ...(body.projectsMax !== undefined ? { projectsMax: body.projectsMax } : {}),
      ...(body.aiMonthMax !== undefined ? { aiMonthMax: body.aiMonthMax } : {}),
    });
    return success({ projectsMax: quotas.projectsMax, aiMonthMax: quotas.aiMonthMax });
  });
}

async function openSession(
  repository: AuthRepository,
  jwtSecret: string,
  userId: string,
  organizationId: string | null,
) {
  const refreshToken = newRefreshToken();
  await repository.createRefreshSession({
    userId,
    organizationId,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
  });
  return accessFor(repository, jwtSecret, userId, organizationId, refreshToken);
}

async function accessFor(
  repository: AuthRepository,
  jwtSecret: string,
  userId: string,
  organizationId: string | null,
  refreshToken: string,
) {
  /*
   * Trois lectures **indépendantes**, donc parallèles.
   *
   * Elles s'enchaînaient. Sur une base locale, trois fois rien ; sur une base distante,
   * trois allers-retours à la file — et cette fonction est sur le chemin de l'inscription,
   * de la connexion, du rafraîchissement et du changement d'organisation.
   *
   * Aucune des trois n'a besoin du résultat des autres : les enchaîner ne faisait
   * qu'additionner des latences.
   */
  const [memberships, user, quotas] = await Promise.all([
    repository.membershipsOf(userId),
    repository.findUserById(userId),
    organizationId ? repository.getQuotas(organizationId) : Promise.resolve(null),
  ]);

  const roles = new Map(
    memberships.map((membership) => [membership.organizationId, membership.role]),
  );
  const activeRole: readonly OrganizationRole[] =
    organizationId && roles.has(organizationId)
      ? [roles.get(organizationId) as OrganizationRole]
      : [];

  /*
   * Les clés sont celles que `quota.ts` lit. Le plafond d'IA partait sous
   * `neftya_ai_analyses_max`, que **personne ne lisait** : une revendication morte, qui
   * aurait fait croire à un repli là où il n'y en avait pas.
   */
  const limits: Record<string, number | null> = {
    ...(quotas?.projectsMax != null
      ? { [PROJECTS_QUOTA_KEY]: quotas.projectsMax }
      : {}),
    ...(quotas?.aiMonthMax != null ? { [AI_QUOTA_KEY]: quotas.aiMonthMax } : {}),
  };
  const { token, expiresIn } = await signAccess(jwtSecret, {
    userId,
    organizationId,
    roles: activeRole,
    language: user?.language ?? 'fr',
    limits,
  });
  return {
    accessToken: token,
    refreshToken,
    expiresIn,
    user: {
      id: userId,
      email: user?.email ?? '',
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
    },
    organizations: memberships.map((membership) => ({
      id: membership.organizationId,
      name: membership.organizationName,
      slug: membership.slug,
      role: membership.role,
    })),
    organizationId,
  };
}

function parse<T extends z.ZodType>(schema: T, payload: unknown): z.infer<T> {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;

  const details: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    (details[key] ??= []).push(issue.message);
  }
  throw validationFailed(details);
}
