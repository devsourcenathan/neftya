import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  createHarness,
  ORGANIZATION_A,
  SAMPLE_MODEL,
  type Harness,
} from '../test-support/harness.js';

/**
 * Ce qui laisse entrer, et ce qui refuse.
 *
 * Chaque contrôle est éprouvé en le faisant échouer : un contrôle qui ne se déclenche
 * jamais ne prouve rien. DealerOS avait un test qui « couvrait » une garde inopérante.
 */

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness('test_access');
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.truncate();
});

const listProjects = async (headers: Record<string, string>) =>
  harness.app.inject({ method: 'GET', url: '/v1/projects', headers });

describe('vérification du jeton', () => {
  it('accepte un jeton valide', async () => {
    const response = await listProjects(await harness.authorization());
    expect(response.statusCode).toBe(200);
  });

  it("refuse l'absence d'en-tête", async () => {
    const response = await listProjects({});
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('refuse un émetteur inattendu', async () => {
    const response = await listProjects(
      await harness.authorization({ issuer: 'https://identity.attaquant.test' }),
    );
    expect(response.statusCode).toBe(401);
  });

  it('refuse un destinataire inattendu', async () => {
    // Signé par la même clé, donc valide en apparence : sans contrôle de `aud`, il
    // entrerait.
    const response = await listProjects(
      await harness.authorization({ audience: 'un-autre-produit' }),
    );
    expect(response.statusCode).toBe(401);
  });

  it('refuse un jeton expiré', async () => {
    const response = await listProjects(
      await harness.authorization({ expiresIn: '-1m' }),
    );
    expect(response.statusCode).toBe(401);
  });

  it('refuse un jeton sans organisation active', async () => {
    // Le jeton juste après `login` : signé, valide, et sans `org`.
    const response = await listProjects(
      await harness.authorization({ omitOrganization: true }),
    );
    expect(response.statusCode).toBe(401);
    expect(response.json().error.message).toMatch(/switch-organization/);
  });

  it('refuse une organisation non abonnée à Neftya', async () => {
    const response = await listProjects(
      await harness.authorization({ products: ['dealeros'] }),
    );
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });
});

describe('correspondance des rôles', () => {
  it('laisse un membre lire et écrire', async () => {
    const headers = await harness.authorization({ roles: ['member'] });

    const created = await harness.app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers,
      payload: { name: 'Étagère', model: SAMPLE_MODEL },
    });

    expect(created.statusCode).toBe(201);
    expect((await listProjects(headers)).statusCode).toBe(200);
  });

  it('interdit la suppression à un membre', async () => {
    const owner = await harness.authorization({ roles: ['owner'] });
    const created = await harness.app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: owner,
      payload: { name: 'Étagère', model: SAMPLE_MODEL },
    });

    const response = await harness.app.inject({
      method: 'DELETE',
      url: `/v1/projects/${created.json().data.id}`,
      headers: await harness.authorization({ roles: ['member'] }),
    });

    expect(response.statusCode).toBe(403);
  });

  it("interdit l'écriture à un gestionnaire de facturation", async () => {
    // Il paie l'abonnement, il ne dessine pas les meubles.
    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: await harness.authorization({ roles: ['billing_manager'] }),
      payload: { name: 'Étagère', model: SAMPLE_MODEL },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('quota du plan', () => {
  const create = (headers: Record<string, string>, name: string) =>
    harness.app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers,
      payload: { name, model: SAMPLE_MODEL },
    });

  it('applique un plafond entier', async () => {
    const headers = await harness.authorization({ limits: { neftya_projects_max: 2 } });

    expect((await create(headers, 'Un')).statusCode).toBe(201);
    expect((await create(headers, 'Deux')).statusCode).toBe(201);

    const refused = await create(headers, 'Trois');
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('CONFLICT');
  });

  it('ne plafonne pas quand la clé vaut null — illimité', async () => {
    const headers = await harness.authorization({
      limits: { neftya_projects_max: null },
    });

    for (const name of ['Un', 'Deux', 'Trois']) {
      expect((await create(headers, name)).statusCode).toBe(201);
    }
  });

  it('ne plafonne pas quand la clé est absente — le plan ne la couvre pas', async () => {
    // Le piège : traiter l'absence comme zéro bloquerait tous les clients existants le
    // jour où la clé est ajoutée au catalogue.
    const headers = await harness.authorization({ limits: {} });

    for (const name of ['Un', 'Deux', 'Trois']) {
      expect((await create(headers, name)).statusCode).toBe(201);
    }
  });

  it('libère une place après une suppression', async () => {
    const headers = await harness.authorization({
      organizationId: ORGANIZATION_A,
      limits: { neftya_projects_max: 1 },
    });

    const first = await create(headers, 'Un');
    expect((await create(headers, 'Deux')).statusCode).toBe(409);

    await harness.app.inject({
      method: 'DELETE',
      url: `/v1/projects/${first.json().data.id}`,
      headers,
    });

    expect((await create(headers, 'Deux')).statusCode).toBe(201);
  });
});
