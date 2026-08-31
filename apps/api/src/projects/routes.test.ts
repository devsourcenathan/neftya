import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { build, cutList, type ParsedFurnitureInput } from '@neftya/engine';
import { createHarness, SAMPLE_MODEL, type Harness } from '../test-support/harness.js';

/**
 * Ce qui est persisté ne vient jamais du client.
 *
 * Le modèle paramétrique est la seule entrée. La liste de pièces, le plan de découpe et
 * les coûts sont recalculés — et c'est cette liste-là qui part à l'atelier. Un client qui
 * enverrait une liste incohérente avec son meuble ferait scier de travers.
 */

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness('test_projets');
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.truncate();
});

const create = async (payload: Record<string, unknown>) =>
  await harness.app.inject({
    method: 'POST',
    url: '/v1/projects',
    headers: await harness.authorization(),
    payload,
  });

describe('projets', () => {
  it('crée un projet et rend son modèle normalisé', async () => {
    const response = await create({ name: '  Dressing  ', model: SAMPLE_MODEL });

    expect(response.statusCode).toBe(201);

    const project = response.json().data;
    expect(project.name).toBe('Dressing');
    // Les valeurs par défaut du moteur sont appliquées à l'entrée, une fois.
    expect(project.model.parameters).toBeDefined();
    expect(project.model.hasBack).toBe(true);
  });

  it('refuse un modèle invalide avec le détail par champ', async () => {
    const response = await create({
      name: 'Impossible',
      model: {
        ...SAMPLE_MODEL,
        dimensions: { widthMm: 1800.5, heightMm: 0, depthMm: 400 },
      },
    });

    expect(response.statusCode).toBe(422);

    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(body.error.details)).toEqual(
      expect.arrayContaining(['model.dimensions.widthMm', 'model.dimensions.heightMm']),
    );
  });

  it('ignore toute donnée dérivée envoyée par le client', async () => {
    const response = await create({
      name: 'Menteur',
      model: SAMPLE_MODEL,
      parts: [{ role: 'shelf', widthMm: 99_999 }],
      cutList: [{ widthMm: 1, heightMm: 1 }],
      costMinor: 0,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data).not.toHaveProperty('parts');

    const stored = await harness.db
      .selectFrom('projects')
      .select('model')
      .executeTakeFirstOrThrow();

    expect(Object.keys(stored.model).sort()).toEqual([
      'compartments',
      'dimensions',
      'hasBack',
      'material',
      'parameters',
    ]);
  });

  it('recalcule le meuble côté serveur, à l’identique du moteur', async () => {
    const created = await create({ name: 'Bibliothèque', model: SAMPLE_MODEL });

    const response = await harness.app.inject({
      method: 'GET',
      url: `/v1/projects/${created.json().data.id}/build`,
      headers: await harness.authorization(),
    });

    expect(response.statusCode).toBe(200);

    const expected = build(created.json().data.model as ParsedFurnitureInput);
    const body = response.json().data;

    expect(body.furniture.parts).toEqual(JSON.parse(JSON.stringify(expected.parts)));
    expect(body.cutList).toEqual(JSON.parse(JSON.stringify(cutList(expected))));
  });

  it('répond 404 sur un identifiant mal formé, comme sur un inconnu', async () => {
    // Distinguer les deux cas redonnerait l'oracle que le 404 ferme.
    const headers = await harness.authorization();

    for (const id of ['pas-un-uuid', '01924f00-0000-7000-8000-0000000000ff']) {
      const response = await harness.app.inject({
        method: 'GET',
        url: `/v1/projects/${id}`,
        headers,
      });
      expect(response.statusCode).toBe(404);
    }
  });

  it('ne rend plus un projet supprimé', async () => {
    const created = await create({ name: 'Éphémère', model: SAMPLE_MODEL });
    const id = created.json().data.id;
    const headers = await harness.authorization();

    const deleted = await harness.app.inject({
      method: 'DELETE',
      url: `/v1/projects/${id}`,
      headers,
    });
    expect(deleted.statusCode).toBe(204);

    const response = await harness.app.inject({
      method: 'GET',
      url: `/v1/projects/${id}`,
      headers,
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('réglages', () => {
  it('vaut null par défaut — suivre la plateforme', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/v1/settings',
      headers: await harness.authorization(),
    });

    expect(response.json().data).toEqual({
      country: null,
      currency: null,
      unit_system: 'metric',
    });
  });

  it('enregistre pays, devise et système d’unités', async () => {
    const response = await harness.app.inject({
      method: 'PUT',
      url: '/v1/settings',
      headers: await harness.authorization(),
      payload: { country: 'CA', currency: 'CAD', unit_system: 'imperial' },
    });

    expect(response.json().data).toEqual({
      country: 'CA',
      currency: 'CAD',
      unit_system: 'imperial',
    });
  });

  it('permet de revenir au réglage de la plateforme', async () => {
    const headers = await harness.authorization();

    await harness.app.inject({
      method: 'PUT',
      url: '/v1/settings',
      headers,
      payload: { country: 'CM', currency: 'XAF' },
    });

    const response = await harness.app.inject({
      method: 'PUT',
      url: '/v1/settings',
      headers,
      payload: { country: null, currency: null },
    });

    expect(response.json().data.country).toBeNull();
    expect(response.json().data.currency).toBeNull();
  });

  it('refuse un code devise fantaisiste', async () => {
    const response = await harness.app.inject({
      method: 'PUT',
      url: '/v1/settings',
      headers: await harness.authorization(),
      payload: { currency: 'euros' },
    });

    expect(response.statusCode).toBe(422);
  });
});
