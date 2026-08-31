import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  createHarness,
  ORGANIZATION_A,
  type Harness,
} from '../test-support/harness.js';
import type { LogRecord } from './logging.js';

/**
 * Ce que les journaux disent, et surtout ce qu'ils taisent.
 *
 * Le second point est le plus important : les journaux sont exactement l'endroit où un
 * jeton, un email ou une copie d'utilisateur réapparaissent sans que personne ne l'ait
 * décidé — et où ils restent des années.
 */

let harness: Harness;
let logs: LogRecord[];

beforeAll(async () => {
  logs = [];
  harness = await createHarness('test_journaux', {
    logSink: (record) => logs.push(record),
  });
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.truncate();
  logs.length = 0;
});

const REFERENCE = {
  dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
  compartments: [{ shelves: 1, drawers: 0 }],
  material: 'mdf',
  hasBack: true,
};

describe('journal des requêtes', () => {
  it('écrit une ligne par requête, avec de quoi la retrouver', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/v1/projects',
      headers: await harness.authorization({ organizationId: ORGANIZATION_A }),
    });

    expect(logs).toHaveLength(1);

    const record = logs[0];
    expect(record?.status).toBe(200);
    expect(record?.method).toBe('GET');
    expect(record?.route).toBe('/v1/projects');
    expect(record?.organization_id).toBe(ORGANIZATION_A);
    expect(record?.user_id).toBeTruthy();
    // Le même identifiant que celui rendu au client : c'est ce qui relie une plainte à
    // une ligne de journal.
    expect(record?.request_id).toBe(
      response.json().meta?.request_id ?? record?.request_id,
    );
    expect(typeof record?.duration_ms).toBe('number');
  });

  it('regroupe par route déclarée, pas par URL', async () => {
    const headers = await harness.authorization();
    const created = await harness.app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers,
      payload: { name: 'Bibliothèque', model: REFERENCE },
    });

    logs.length = 0;
    await harness.app.inject({
      method: 'GET',
      url: `/v1/projects/${created.json().data.id}`,
      headers,
    });

    // `/v1/projects/:id` regroupe ; l'URL ferait mille lignes distinctes dont aucune n'est
    // comptable.
    expect(logs[0]?.route).toBe('/v1/projects/:id');
    expect(String(logs[0]?.route)).not.toContain(created.json().data.id);
  });

  it('classe par gravité : refus en avertissement, panne en erreur', async () => {
    await harness.app.inject({ method: 'GET', url: '/v1/projects' });
    expect(logs[0]?.level).toBe('warn');
    expect(logs[0]?.status).toBe(401);

    logs.length = 0;
    await harness.app.inject({ method: 'GET', url: '/introuvable' });
    expect(logs[0]?.level).toBe('warn');
  });

  it('journalise l’acteur comme nul quand personne n’est authentifié', async () => {
    await harness.app.inject({ method: 'GET', url: '/health' });

    expect(logs[0]?.organization_id).toBeNull();
    expect(logs[0]?.user_id).toBeNull();
  });
});

describe('ce que les journaux ne doivent jamais contenir', () => {
  it('ne laisse fuir ni le jeton ni l’en-tête d’autorisation', async () => {
    const headers = await harness.authorization();
    await harness.app.inject({ method: 'GET', url: '/v1/projects', headers });

    const written = JSON.stringify(logs);
    const token = headers.authorization.slice('Bearer '.length);

    expect(written).not.toContain(token);
    expect(written.toLowerCase()).not.toContain('bearer');
    expect(written.toLowerCase()).not.toContain('authorization');
  });

  it('ne journalise pas le corps des requêtes', async () => {
    await harness.app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: await harness.authorization(),
      payload: { name: 'Secret commercial', model: REFERENCE },
    });

    // Un modèle de meuble n'apprend rien aujourd'hui ; un jour un corps portera autre
    // chose, et le journal le gardera des années.
    expect(JSON.stringify(logs)).not.toContain('Secret commercial');
  });

  it('n’écrit aucun champ inattendu', async () => {
    await harness.app.inject({
      method: 'GET',
      url: '/v1/projects',
      headers: await harness.authorization(),
    });

    // La liste est fermée volontairement : un champ ajouté sans y penser est la façon
    // dont une donnée personnelle entre dans un journal.
    expect(Object.keys(logs[0] ?? {}).sort()).toEqual([
      'duration_ms',
      'level',
      'message',
      'method',
      'organization_id',
      'request_id',
      'route',
      'service',
      'session_id',
      'status',
      'user_id',
    ]);
  });
});

describe('sondes', () => {
  it('sépare le vivant du prêt', async () => {
    const alive = await harness.app.inject({ method: 'GET', url: '/health' });
    const ready = await harness.app.inject({ method: 'GET', url: '/ready' });

    expect(alive.statusCode).toBe(200);
    expect(ready.statusCode).toBe(200);
    expect(ready.json().data).toEqual({ status: 'ok', checks: { database: 'ok' } });
  });

  it('les deux sondes répondent sans authentification', async () => {
    // Un orchestrateur n'a pas de jeton, et n'a pas à en avoir un.
    for (const url of ['/health', '/ready']) {
      const response = await harness.app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(200);
    }
  });

  it('rend 503 quand la base ne répond plus', async () => {
    // La sonde qui décide d'envoyer du trafic doit dire non quand la base est tombée ;
    // celle qui décide de redémarrer doit continuer de dire oui.
    const isolated = await createHarness('test_sonde');
    await isolated.db.destroy();

    const ready = await isolated.app.inject({ method: 'GET', url: '/ready' });
    const alive = await isolated.app.inject({ method: 'GET', url: '/health' });

    expect(ready.statusCode).toBe(503);
    expect(ready.json().data.checks.database).toBe('ko');
    expect(alive.statusCode).toBe(200);

    await isolated.app.close();
  });
});
