import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHarness, type Harness } from '../test-support/harness.js';

/**
 * Les origines admises.
 *
 * Une **liste**, jamais `*`. L'API porte un jeton dans un en-tête : une origine quelconque
 * autorisée à l'envoyer est une page quelconque qui agit au nom de l'utilisateur.
 *
 * @see docs/OPERATIONS.md §2
 */

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness('test_cors', {
    allowedOrigins: ['https://neftya.sekuu.com', 'http://localhost:5173'],
  });
});

afterAll(async () => {
  await harness.close();
});

const preflight = (origin: string) =>
  harness.app.inject({
    method: 'OPTIONS',
    url: '/v1/projects',
    headers: {
      origin,
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization',
    },
  });

describe('origines', () => {
  it('laisse passer une origine de la liste', async () => {
    const response = await preflight('http://localhost:5173');

    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('ne répond aucun en-tête à une origine inconnue', async () => {
    // Pas une erreur : une réponse sans en-tête. C'est au navigateur de refuser, et c'est
    // ce qu'il fait.
    const response = await preflight('https://attaquant.test');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('ne répond jamais l’étoile', async () => {
    for (const origin of ['http://localhost:5173', 'https://attaquant.test']) {
      const response = await preflight(origin);
      expect(response.headers['access-control-allow-origin']).not.toBe('*');
    }
  });

  it('laisse tranquille un appel sans origine', async () => {
    // curl, une sonde, un appel serveur à serveur : il n'y a rien à refuser, et refuser
    // casserait les sondes de l'hébergeur.
    const response = await harness.app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
  });

  it('n’admet aucune origine quand la liste est vide', async () => {
    // Le bon défaut : une liste oubliée empêche l'interface de fonctionner, elle n'ouvre
    // pas l'API à tout le monde.
    const closed = await createHarness('test_cors_ferme');

    const response = await closed.app.inject({
      method: 'OPTIONS',
      url: '/v1/projects',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();

    await closed.close();
  });
});
