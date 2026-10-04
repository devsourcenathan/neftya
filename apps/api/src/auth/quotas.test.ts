import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHarness, type Harness } from '../test-support/harness.js';
import { resetAuthRateLimit } from './routes.js';

/**
 * Les plafonds locaux, et leurs trois états.
 *
 * Pas de ligne = pas couvert, `null` = illimité, entier = plafond.
 * Confondre les deux premiers bloquerait, le jour où un plafond est ajouté,
 * toutes les organisations créées avant — la leçon de SEKUU.md §5, reprise
 * ici avec des lignes de base plutôt que des claims.
 */

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness('test_quotas');
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.truncate();
  resetAuthRateLimit();
});

const PASSWORD = 'mot-de-passe-suffisamment-long';

async function register(email = 'menuisier@atelier.test') {
  const response = await harness.app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: {
      email,
      password: PASSWORD,
      firstName: 'Menuisier',
      lastName: 'Demo',
      organizationName: 'Atelier Demo',
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().data as { accessToken: string; organizationId: string };
}

const MODEL = {
  dimensions: { widthMm: 1800, heightMm: 2000, depthMm: 400 },
  compartments: [{ shelves: 2, drawers: 0 }],
  material: 'mdf',
  hasBack: true,
};

async function createProject(accessToken: string, name: string) {
  return harness.app.inject({
    method: 'POST',
    url: '/v1/projects',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { name, model: MODEL },
  });
}

describe('quotas de projets', () => {
  it('sans ligne de quotas, ne plafonne pas', async () => {
    const session = await register();
    for (const name of ['Un', 'Deux', 'Trois']) {
      expect((await createProject(session.accessToken, name)).statusCode).toBe(201);
    }
  });

  it('mord sans attendre un nouveau jeton', async () => {
    const session = await register();

    await harness.app.inject({
      method: 'PUT',
      url: '/v1/auth/quotas',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { projectsMax: 1 },
    });

    /*
     * **Le même jeton qu'avant le réglage.**
     *
     * Le plafond se lisait dans les revendications du jeton : un patron qui réglait le
     * sien ne voyait rien pendant un quart d'heure, alors que le plafond d'IA, lu en base,
     * mordait tout de suite. La table est la source de vérité ; le jeton n'est plus que le
     * repli, pour un jeton signé par une plateforme qui ne partage pas notre base.
     */
    expect((await createProject(session.accessToken, 'Premier')).statusCode).toBe(201);

    const blocked = await createProject(session.accessToken, 'Second');
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('CONFLICT');
  });

  it('plafonne à l’entier configuré, puis libère après suppression', async () => {
    const session = await register();

    const saved = await harness.app.inject({
      method: 'PUT',
      url: '/v1/auth/quotas',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { projectsMax: 1 },
    });
    expect(saved.statusCode).toBe(200);

    // Se reconnecter n'est plus nécessaire depuis que le plafond se lit en base ; on le
    // fait quand même ici, pour que le chemin « jeton frais » reste couvert.
    const login = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'menuisier@atelier.test', password: PASSWORD },
    });
    const token = login.json().data.accessToken as string;

    expect((await createProject(token, 'Premier')).statusCode).toBe(201);
    const blocked = await createProject(token, 'Second');
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('CONFLICT');
  });

  it('null vaut illimité, comme une clé absente', async () => {
    const session = await register();
    await harness.app.inject({
      method: 'PUT',
      url: '/v1/auth/quotas',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { projectsMax: null },
    });

    const login = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'menuisier@atelier.test', password: PASSWORD },
    });
    const token = login.json().data.accessToken as string;
    for (const name of ['Un', 'Deux', 'Trois']) {
      expect((await createProject(token, name)).statusCode).toBe(201);
    }
  });

  it('zéro bloque tout', async () => {
    const session = await register();
    await harness.app.inject({
      method: 'PUT',
      url: '/v1/auth/quotas',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { projectsMax: 0 },
    });

    const login = await harness.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'menuisier@atelier.test', password: PASSWORD },
    });
    expect(
      (await createProject(login.json().data.accessToken as string, 'Non')).statusCode,
    ).toBe(409);
  });

  it('seul le propriétaire écrit les plafonds ; chacun les lit', async () => {
    const owner = await register('owner@atelier.test');
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
    ).json().data as { accessToken: string };

    const read = await harness.app.inject({
      method: 'GET',
      url: '/v1/auth/quotas',
      headers: { authorization: `Bearer ${member.accessToken}` },
    });
    expect(read.statusCode).toBe(200);

    const write = await harness.app.inject({
      method: 'PUT',
      url: '/v1/auth/quotas',
      headers: { authorization: `Bearer ${member.accessToken}` },
      payload: { projectsMax: 1 },
    });
    expect(write.statusCode).toBe(403);
  });

  it('refuse un plafond négatif', async () => {
    const session = await register();
    const response = await harness.app.inject({
      method: 'PUT',
      url: '/v1/auth/quotas',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { projectsMax: -1 },
    });
    expect(response.statusCode).toBe(422);
  });
});
