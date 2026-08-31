import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('API', () => {
  it('répond sur /health', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true, data: { status: 'ok' } });
  });

  it('rend l’enveloppe de la plateforme sur une route inconnue', async () => {
    const response = await app.inject({ method: 'GET', url: '/nexiste-pas' });

    expect(response.statusCode).toBe(404);

    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.meta.request_id).toBeTruthy();
  });
});
