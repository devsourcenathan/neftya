import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHarness, type Harness } from '../test-support/harness.js';
import { resetAuthRateLimit } from './routes.js';

/**
 * L'identité locale, éprouvée garde par garde.
 *
 * Chaque test casse une chose précise : mot de passe faux, email pris,
 * jeton rejoué, organisation d'autrui. Un test qui resterait vert sans
 * sa garde ne prouve rien — c'est la règle de SEKUU.md §10, reprise ici.
 */

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness('test_auth');
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.truncate();
  resetAuthRateLimit();
});

const PASSWORD = 'mot-de-passe-suffisamment-long';

async function register(
  email = 'menuisier@atelier.test',
  organizationName = 'Atelier Demo',
) {
  return harness.app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: {
      email,
      password: PASSWORD,
      firstName: 'Menuisier',
      lastName: 'Demo',
      organizationName,
    },
  });
}

/**
 * Ouvre le plafond de membres.
 *
 * Une organisation naît au palier gratuit, qui n'admet qu'**un** membre — le propriétaire.
 * Les tests qui portent sur l'invitation elle-même l'ouvrent donc d'abord : sans quoi ils
 * vérifieraient le quota, qui a ses propres tests.
 */
async function allowMembers(accessToken: string): Promise<void> {
  await harness.app.inject({
    method: 'PUT',
    url: '/v1/auth/quotas',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { membersMax: null },
  });
}

describe('inscription et connexion', () => {
  it("crée le compte, l'organisation, et rend une session active", async () => {
    const response = await register();

    expect(response.statusCode).toBe(201);
    const session = response.json().data;
    expect(session.accessToken).toBeTypeOf('string');
    expect(session.refreshToken).toBeTypeOf('string');
    expect(session.organizationId).toBeTypeOf('string');
    expect(session.organizations).toHaveLength(1);
    expect(session.organizations[0].role).toBe('owner');
  });

  it('refuse un email déjà pris, sans dire autre chose', async () => {
    expect((await register()).statusCode).toBe(201);

    const second = await register();
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('CONFLICT');
  });

  it('refuse un mot de passe trop court', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'court@atelier.test',
        password: 'trop-court',
        firstName: 'Menuisier',
        lastName: 'Demo',
        organizationName: 'Atelier',
      },
    });

    expect(response.statusCode).toBe(422);
  });

  it('connecte avec les bons identifiants, refuse sinon — sans distinguer', async () => {
    await register();

    const ok = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'menuisier@atelier.test', password: PASSWORD },
    });
    expect(ok.statusCode).toBe(200);

    const wrongPassword = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'menuisier@atelier.test', password: `${PASSWORD}-faux` },
    });
    const unknownEmail = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'inconnu@atelier.test', password: PASSWORD },
    });
    // Même statut, même code : l'existence du compte ne se devine pas.
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('ne stocke jamais le mot de passe en clair', async () => {
    await register();
    const row = await harness.db
      .selectFrom('users')
      .select('password_hash')
      .where('email', '=', 'menuisier@atelier.test')
      .executeTakeFirstOrThrow();

    expect(row.password_hash).not.toContain(PASSWORD);
    expect(row.password_hash.startsWith('scrypt$')).toBe(true);
  });
});

describe('sessions et rotation', () => {
  it('fait tourner le jeton de rafraîchissement à chaque usage', async () => {
    const session = (await register()).json().data;

    const first = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    expect(first.statusCode).toBe(200);
    const next = first.json().data;
    expect(next.refreshToken).not.toBe(session.refreshToken);

    // L'ancien ne passe plus : il a été tourné.
    const replay = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    expect(replay.statusCode).toBe(401);
  });

  it('révoque toute la session quand un jeton tourné est rejoué', async () => {
    const session = (await register()).json().data;
    const second = (await firstRefresh(session.refreshToken)).json().data;

    // Rejouer le tout premier jeton : vol détecté, tout est révoqué.
    const theft = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    expect(theft.statusCode).toBe(401);

    // Même le jeton légitime le plus récent ne passe plus.
    const legitimate = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: second.refreshToken },
    });
    expect(legitimate.statusCode).toBe(401);
  });

  it('déconnecte : le jeton révoqué ne rafraîchit plus', async () => {
    const session = (await register()).json().data;

    const logout = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      payload: { refreshToken: session.refreshToken },
    });
    expect(logout.statusCode).toBe(200);

    const after = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    expect(after.statusCode).toBe(401);
  });

  async function firstRefresh(refreshToken: string) {
    return harness.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken },
    });
  }
});

describe('organisations et invitations', () => {
  it('change d’organisation active, et refuse celle d’autrui', async () => {
    const sessionA = (await register('a@atelier.test', 'Atelier A')).json().data;
    const sessionB = (await register('b@atelier.test', 'Atelier B')).json().data;

    const switched = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/switch',
      headers: { authorization: `Bearer ${sessionA.accessToken}` },
      payload: { organizationId: sessionA.organizationId },
    });
    expect(switched.statusCode).toBe(200);

    const foreign = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/switch',
      headers: { authorization: `Bearer ${sessionA.accessToken}` },
      payload: { organizationId: sessionB.organizationId },
    });
    // 404 et non 403 : ne pas confirmer l'existence d'autrui.
    expect(foreign.statusCode).toBe(404);
  });

  it('invite un membre, qui accepte et rejoint avec le bon rôle', async () => {
    const session = (await register()).json().data;
    await allowMembers(session.accessToken);

    const invited = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/invitations',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { email: 'apprenti@atelier.test', role: 'member' },
    });
    expect(invited.statusCode).toBe(201);
    const { invitationToken } = invited.json().data;

    const accepted = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/accept-invitation',
      payload: {
        token: invitationToken,
        password: PASSWORD,
        firstName: 'Apprenti',
        lastName: 'Accepté',
      },
    });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json().data.organizationId).toBe(session.organizationId);
    expect(accepted.json().data.organizations[0].role).toBe('member');

    // À usage unique : la seconde acceptation échoue.
    const reused = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/accept-invitation',
      payload: {
        token: invitationToken,
        password: PASSWORD,
        firstName: 'Autre',
        lastName: 'Venu',
      },
    });
    expect(reused.statusCode).toBe(404);
  });

  it('un membre ne peut pas inviter', async () => {
    const owner = (await register('owner@atelier.test', 'Atelier')).json().data;
    await allowMembers(owner.accessToken);

    const invitation = (
      await harness.app.inject({
        method: 'POST',
        url: '/v1/auth/invitations',
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { email: 'membre@atelier.test', role: 'member' },
      })
    ).json().data;

    const member = (
      await harness.app.inject({
        method: 'POST',
        url: '/v1/auth/accept-invitation',
        payload: {
          token: invitation.invitationToken,
          password: PASSWORD,
          firstName: 'Membre',
          lastName: 'Simple',
        },
      })
    ).json().data;

    const attempt = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/invitations',
      headers: { authorization: `Bearer ${member.accessToken}` },
      payload: { email: 'troisieme@atelier.test', role: 'member' },
    });
    expect(attempt.statusCode).toBe(403);
  });
});

describe('cloisonnement avec jetons locaux', () => {
  it('un jeton local de A obtient 404 sur un projet de B', async () => {
    const sessionA = (await register('locale-a@atelier.test', 'Atelier A')).json().data;
    const sessionB = (await register('locale-b@atelier.test', 'Atelier B')).json().data;

    const created = await harness.app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { authorization: `Bearer ${sessionB.accessToken}` },
      payload: {
        name: 'Secret de B',
        model: {
          dimensions: { widthMm: 1800, heightMm: 2000, depthMm: 400 },
          compartments: [{ shelves: 2, drawers: 0 }],
          material: 'mdf',
          hasBack: true,
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const projectId = created.json().data.id as string;

    const read = await harness.app.inject({
      method: 'GET',
      url: `/v1/projects/${projectId}`,
      headers: { authorization: `Bearer ${sessionA.accessToken}` },
    });
    expect(read.statusCode).toBe(404);
  });

  it('un jeton sans organisation est refusé', async () => {
    const session = (await register()).json().data;
    // Deux organisations : la connexion n'active aucune par défaut.
    await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/organizations',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { name: 'Second atelier' },
    });

    const login = (
      await harness.app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: 'menuisier@atelier.test', password: PASSWORD },
      })
    ).json().data;
    // Deux appartenances : aucune organisation active, pas de jeton utilitaire.
    expect(login.organizationId).toBeNull();
  });
});
