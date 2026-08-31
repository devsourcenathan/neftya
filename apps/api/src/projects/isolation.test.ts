import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  createHarness,
  ORGANIZATION_A,
  ORGANIZATION_B,
  SAMPLE_MODEL,
  USER_B,
  type Harness,
} from '../test-support/harness.js';

/**
 * Le test A/B : deux organisations, et rien qui traverse.
 *
 * C'est le critère de sortie de la phase 2. Il porte sur **les quatre verbes et la
 * sous-ressource** : une lecture correctement cloisonnée avec un `PATCH` qui ne l'est pas
 * laisse écrire chez le voisin, et c'est pire.
 *
 * @see docs/IMPLEMENTATION.md — phase 2
 * @see docs/SEKUU.md §10
 */

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness('test_isolation');
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.truncate();
});

async function createProjectFor(
  organizationId: string,
  name = 'Bibliothèque',
): Promise<string> {
  const response = await harness.app.inject({
    method: 'POST',
    url: '/v1/projects',
    headers: await harness.authorization({ organizationId }),
    payload: { name, model: SAMPLE_MODEL },
  });

  expect(response.statusCode).toBe(201);
  return response.json().data.id as string;
}

describe('cloisonnement entre organisations', () => {
  it('ne montre à B aucun projet de A', async () => {
    await createProjectFor(ORGANIZATION_A);

    const response = await harness.app.inject({
      method: 'GET',
      url: '/v1/projects',
      headers: await harness.authorization({
        organizationId: ORGANIZATION_B,
        userId: USER_B,
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([]);
  });

  it.each([
    ['GET', (id: string) => `/v1/projects/${id}`, undefined],
    ['GET', (id: string) => `/v1/projects/${id}/build`, undefined],
    ['PATCH', (id: string) => `/v1/projects/${id}`, { name: 'Détourné' }],
    ['DELETE', (id: string) => `/v1/projects/${id}`, undefined],
  ] as const)(
    'répond 404 — et non 403 — à un %s de B sur un projet de A',
    async (method, url, payload) => {
      const id = await createProjectFor(ORGANIZATION_A);

      const response = await harness.app.inject({
        method,
        url: url(id),
        headers: await harness.authorization({
          organizationId: ORGANIZATION_B,
          userId: USER_B,
        }),
        ...(payload ? { payload } : {}),
      });

      // 404 et non 403 : un 403 confirmerait l'existence de la ressource à qui essaie
      // des identifiants au hasard.
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    },
  );

  it('laisse le projet de A intact après les tentatives de B', async () => {
    const id = await createProjectFor(ORGANIZATION_A, 'Dressing');

    await harness.app.inject({
      method: 'PATCH',
      url: `/v1/projects/${id}`,
      headers: await harness.authorization({ organizationId: ORGANIZATION_B }),
      payload: { name: 'Détourné' },
    });
    await harness.app.inject({
      method: 'DELETE',
      url: `/v1/projects/${id}`,
      headers: await harness.authorization({ organizationId: ORGANIZATION_B }),
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: `/v1/projects/${id}`,
      headers: await harness.authorization({ organizationId: ORGANIZATION_A }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.name).toBe('Dressing');
  });

  it('ignore une organisation envoyée dans le corps de la requête', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: await harness.authorization({ organizationId: ORGANIZATION_A }),
      payload: {
        name: 'Injection',
        model: SAMPLE_MODEL,
        organization_id: ORGANIZATION_B,
        organizationId: ORGANIZATION_B,
      },
    });

    expect(response.statusCode).toBe(201);

    const stored = await harness.db
      .selectFrom('projects')
      .select('organization_id')
      .executeTakeFirstOrThrow();

    expect(stored.organization_id).toBe(ORGANIZATION_A);
  });

  it('cloisonne aussi les réglages', async () => {
    await harness.app.inject({
      method: 'PUT',
      url: '/v1/settings',
      headers: await harness.authorization({ organizationId: ORGANIZATION_A }),
      payload: { country: 'CM', currency: 'XAF' },
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: '/v1/settings',
      headers: await harness.authorization({ organizationId: ORGANIZATION_B }),
    });

    expect(response.json().data).toEqual({
      country: null,
      currency: null,
      unit_system: 'metric',
    });
  });
});
