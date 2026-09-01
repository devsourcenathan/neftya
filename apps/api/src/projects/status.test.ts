import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHarness, type Harness } from '../test-support/harness.js';

/**
 * L'état d'avancement d'un projet.
 *
 * Il est **déduit**, jamais saisi : un statut qu'on choisit dans une liste déroulante ment
 * dès le lendemain, parce que personne ne revient le corriger.
 */

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness('test_statut');
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.truncate();
});

/**
 * Un meuble sain : rien à signaler.
 *
 * 600 mm de portée, non 900 : à 900 l'étagère fléchit au-delà de l'admissible et le moteur
 * le dit — ce qui rendait ce témoin « à revoir » et faussait la moitié des tests.
 */
const SOUND = {
  dimensions: { widthMm: 600, heightMm: 700, depthMm: 400 },
  compartments: [{ shelves: 1, drawers: 0, doors: 0 }],
  material: 'mdf',
  hasBack: true,
};

/** Une étagère de 1400 mm de portée : elle fléchit, le moteur le dit. */
const SAGGING = {
  dimensions: { widthMm: 1440, heightMm: 900, depthMm: 400 },
  compartments: [{ shelves: 2, drawers: 0, doors: 0 }],
  material: 'mdf',
  hasBack: true,
};

async function create(model: unknown, name = 'Projet'): Promise<string> {
  const response = await harness.app.inject({
    method: 'POST',
    url: '/v1/projects',
    headers: await harness.authorization(),
    payload: { name, model },
  });

  expect(response.statusCode).toBe(201);
  return response.json().data.id as string;
}

async function statusOf(id: string): Promise<string> {
  const response = await harness.app.inject({
    method: 'GET',
    url: `/v1/projects/${id}`,
    headers: await harness.authorization(),
  });

  return response.json().data.status as string;
}

describe('statut', () => {
  it('un projet neuf est un brouillon', async () => {
    expect(await statusOf(await create(SOUND))).toBe('draft');
  });

  it('un export figé le rend prêt à couper', async () => {
    const id = await create(SOUND);

    await harness.app.inject({
      method: 'POST',
      url: `/v1/projects/${id}/exports`,
      headers: await harness.authorization(),
      payload: {},
    });

    // C'est la seule trace qu'un plan est parti à l'atelier.
    expect(await statusOf(id)).toBe('ready');
  });

  it('un avertissement du moteur prime sur l’export', async () => {
    const id = await create(SAGGING);

    await harness.app.inject({
      method: 'POST',
      url: `/v1/projects/${id}/exports`,
      headers: await harness.authorization(),
      payload: {},
    });

    // Un plan parti avec un avertissement reste un plan à relire.
    expect(await statusOf(id)).toBe('needs_review');
  });

  it('suit le modèle : corriger le meuble change le statut', async () => {
    const id = await create(SAGGING);
    expect(await statusOf(id)).toBe('needs_review');

    await harness.app.inject({
      method: 'PATCH',
      url: `/v1/projects/${id}`,
      headers: await harness.authorization(),
      payload: { model: SOUND },
    });

    // Déduit à chaque appel : il ne peut pas diverger de ce que le projet est vraiment.
    expect(await statusOf(id)).toBe('draft');
  });

  it('apparaît dans la liste, sans une requête par projet', async () => {
    await create(SOUND, 'Sain');
    const warned = await create(SAGGING, 'À revoir');

    await harness.app.inject({
      method: 'POST',
      url: `/v1/projects/${warned}/exports`,
      headers: await harness.authorization(),
      payload: {},
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: '/v1/projects',
      headers: await harness.authorization(),
    });

    const byName = Object.fromEntries(
      (
        response.json().data as { name: string; status: string; export_count: number }[]
      ).map((project) => [project.name, project]),
    );

    expect(byName['Sain']?.status).toBe('draft');
    expect(byName['Sain']?.export_count).toBe(0);
    expect(byName['À revoir']?.status).toBe('needs_review');
    expect(byName['À revoir']?.export_count).toBe(1);
  });

  it('ne compte pas les exports d’une autre organisation', async () => {
    const id = await create(SOUND);

    // Le compte passe par une sous-requête ; elle porte le cloisonnement comme le reste.
    const response = await harness.app.inject({
      method: 'GET',
      url: `/v1/projects/${id}`,
      headers: await harness.authorization(),
    });

    expect(response.json().data.export_count).toBe(0);
  });
});
