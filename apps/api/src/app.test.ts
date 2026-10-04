import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHarness, type Harness } from './test-support/harness.js';

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness('test_app');
});

afterAll(async () => {
  await harness.close();
});

/**
 * Une installation qui a mis Sekuu de côté.
 *
 * Le serveur exigeait `SEKUU_JWKS_URL`, `SEKUU_ISSUER` et `SEKUU_AUDIENCE` pour démarrer,
 * alors que l'identité est locale. Il fallait donc inventer trois valeurs pointant dans le
 * vide — ce qui est pire que de s'en passer : on ne sait plus lesquelles servent.
 */
describe('sans vérifieur de plateforme', () => {
  let seule: Harness;

  beforeAll(async () => {
    seule = await createHarness('test_app_sans_sekuu', { withoutSekuu: true });
  });

  afterAll(async () => {
    await seule.close();
  });

  it('démarre et sert les routes publiques', async () => {
    const response = await seule.app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
  });

  it('reconnaît une session locale de bout en bout', async () => {
    const registered = await seule.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'sans.sekuu@atelier.test',
        password: 'mot-de-passe-suffisamment-long',
        firstName: 'Sans',
        lastName: 'Sekuu',
        organizationName: 'Atelier sans Sekuu',
      },
    });
    expect(registered.statusCode).toBe(201);

    const me = await seule.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: {
        authorization: `Bearer ${registered.json().data.accessToken as string}`,
      },
    });
    expect(me.statusCode).toBe(200);
  });

  it('refuse un jeton de plateforme, qui n’est plus qu’un jeton invalide', async () => {
    const response = await seule.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      // Signé par le JWKS d'essai : valide pour une installation branchée sur Sekuu,
      // illisible pour celle-ci. C'est la conséquence voulue, pas un défaut.
      headers: await seule.authorization(),
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('API', () => {
  it('répond sur /health sans authentification', async () => {
    // La sonde de vie précède l'authentification : un orchestrateur n'a pas de jeton.
    const response = await harness.app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, data: { status: 'ok' } });
  });

  it('rend l’enveloppe de la plateforme sur une route inconnue', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/nexiste-pas' });

    expect(response.statusCode).toBe(404);

    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.meta.request_id).toBeTruthy();
  });
});
