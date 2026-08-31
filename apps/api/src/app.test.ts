import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHarness, type Harness } from './test-support/harness.js';

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness('test_app');
});

afterAll(async () => {
  await harness.close();
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
