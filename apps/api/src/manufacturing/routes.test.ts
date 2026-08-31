import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  createHarness,
  ORGANIZATION_A,
  ORGANIZATION_B,
  type Harness,
} from '../test-support/harness.js';

/**
 * La fabrication vue de l'API : ce qui est recalculé, ce qui est figé, et qui a le droit
 * de voir les prix.
 */

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness('test_fabrication');
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.truncate();
});

/** Le meuble du §2 de MANUFACTURING.md. */
const REFERENCE = {
  dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
  compartments: [
    { shelves: 1, drawers: 0 },
    { shelves: 1, drawers: 0 },
  ],
  material: 'mdf',
  hasBack: true,
};

async function createProject(organizationId = ORGANIZATION_A): Promise<string> {
  const response = await harness.app.inject({
    method: 'POST',
    url: '/v1/projects',
    headers: await harness.authorization({ organizationId }),
    payload: { name: 'Bibliothèque', model: REFERENCE },
  });

  expect(response.statusCode).toBe(201);
  return response.json().data.id as string;
}

describe('plan de fabrication', () => {
  it('rend le plan documenté : un panneau de 18 mm, 93,2 %', async () => {
    const id = await createProject();

    const response = await harness.app.inject({
      method: 'GET',
      url: `/v1/projects/${id}/manufacturing`,
      headers: await harness.authorization(),
    });

    expect(response.statusCode).toBe(200);

    const data = response.json().data;
    const thick = data.nesting.panels.filter(
      (panel: { thicknessMm: number }) => panel.thicknessMm === 18,
    );

    expect(thick).toHaveLength(1);
    expect(Math.round(thick[0].utilisation * 1000) / 10).toBe(93.2);
    expect(data.bill.edgeBandingMm).toBe(7038);
    expect(data.assembly[0].key).toBe('carcass');
  });

  it('cache le devis à qui n’a pas le droit de voir les coûts', async () => {
    const id = await createProject();

    // Le besoin métier réel : un menuisier salarié accède au plan de découpe et au
    // guide d'assemblage sans voir les marges.
    const member = await harness.app.inject({
      method: 'GET',
      url: `/v1/projects/${id}/manufacturing`,
      headers: await harness.authorization({ roles: ['member'] }),
    });

    expect(member.statusCode).toBe(200);
    expect(member.json().data.quotation).toBeUndefined();
    expect(member.json().data.cut_list.length).toBeGreaterThan(0);

    const owner = await harness.app.inject({
      method: 'GET',
      url: `/v1/projects/${id}/manufacturing`,
      headers: await harness.authorization({ roles: ['owner'] }),
    });

    expect(owner.json().data.quotation).toBeDefined();
  });

  it('répond 404 sur le projet d’une autre organisation', async () => {
    const id = await createProject(ORGANIZATION_A);

    for (const url of [
      `/v1/projects/${id}/manufacturing`,
      `/v1/projects/${id}/cut-list.csv`,
      `/v1/projects/${id}/cut-plan.pdf`,
      `/v1/projects/${id}/exports`,
    ]) {
      const response = await harness.app.inject({
        method: 'GET',
        url,
        headers: await harness.authorization({ organizationId: ORGANIZATION_B }),
      });

      expect(response.statusCode).toBe(404);
    }
  });
});

describe('devis', () => {
  const setPrice = async (reference: string, amountMinor: number, currency = 'XAF') =>
    harness.app.inject({
      method: 'PUT',
      url: '/v1/prices',
      headers: await harness.authorization(),
      payload: { reference, amountMinor, currency },
    });

  it('laisse le total vide tant qu’un prix manque', async () => {
    const id = await createProject();
    await setPrice('panel:mdf:18', 15_000);

    const response = await harness.app.inject({
      method: 'GET',
      url: `/v1/projects/${id}/manufacturing`,
      headers: await harness.authorization(),
    });

    const quotation = response.json().data.quotation;

    // Un total partiel se lit comme un total, et personne ne relit un nombre qui
    // s'affiche.
    expect(quotation.total).toBeNull();
    expect(quotation.missing).toContain('edge_banding');
    expect(
      quotation.lines.find(
        (line: { reference: string }) => line.reference === 'panel:mdf:18',
      ).total,
    ).toEqual({ amount: 15_000, currency: 'XAF' });
  });

  it('additionne quand tout est saisi', async () => {
    const id = await createProject();

    const references = [
      'panel:mdf:18',
      'panel:mdf:8',
      'edge_banding',
      'accessory:screw_4x50',
      'accessory:dowel_8',
      'accessory:shelf_support',
      'accessory:glue',
    ];
    for (const reference of references) await setPrice(reference, 100);

    const response = await harness.app.inject({
      method: 'GET',
      url: `/v1/projects/${id}/manufacturing`,
      headers: await harness.authorization(),
    });

    const quotation = response.json().data.quotation;

    expect(quotation.missing).toEqual([]);
    expect(quotation.total.currency).toBe('XAF');
    expect(quotation.total.amount).toBeGreaterThan(0);
  });

  it('suit la devise de l’organisation', async () => {
    const id = await createProject();
    await harness.app.inject({
      method: 'PUT',
      url: '/v1/settings',
      headers: await harness.authorization(),
      payload: { currency: 'EUR' },
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: `/v1/projects/${id}/manufacturing`,
      headers: await harness.authorization(),
    });

    expect(response.json().data.quotation.currency).toBe('EUR');
  });

  it('interdit la saisie des prix à un membre', async () => {
    const response = await harness.app.inject({
      method: 'PUT',
      url: '/v1/prices',
      headers: await harness.authorization({ roles: ['member'] }),
      payload: { reference: 'panel:mdf:18', amountMinor: 100, currency: 'XAF' },
    });

    expect(response.statusCode).toBe(403);
  });

  it('refuse un montant non entier — un prix flottant est un devis faux', async () => {
    const response = await harness.app.inject({
      method: 'PUT',
      url: '/v1/prices',
      headers: await harness.authorization(),
      payload: { reference: 'panel:mdf:18', amountMinor: 12.5, currency: 'EUR' },
    });

    expect(response.statusCode).toBe(422);
  });

  it('cloisonne les prix entre organisations', async () => {
    await setPrice('panel:mdf:18', 15_000);

    const response = await harness.app.inject({
      method: 'GET',
      url: '/v1/prices',
      headers: await harness.authorization({ organizationId: ORGANIZATION_B }),
    });

    expect(response.json().data).toEqual([]);
  });
});

describe('exports', () => {
  it('rend un CSV que les scies savent lire', async () => {
    const id = await createProject();

    const response = await harness.app.inject({
      method: 'GET',
      url: `/v1/projects/${id}/cut-list.csv`,
      headers: await harness.authorization(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');

    const lines = response.body.trim().split('\r\n');
    expect(lines[0]).toContain('id;longueur_mm;largeur_mm');
    // P01 à P06.
    expect(lines).toHaveLength(7);
    expect(lines[1]).toMatch(/^P01;1800;400;18;1;mdf/u);
  });

  it('rend un PDF, à la taille de papier du pays', async () => {
    const id = await createProject();

    const a4 = await harness.app.inject({
      method: 'GET',
      url: `/v1/projects/${id}/cut-plan.pdf`,
      headers: await harness.authorization(),
    });

    expect(a4.statusCode).toBe(200);
    expect(a4.headers['content-type']).toBe('application/pdf');
    expect(a4.rawPayload.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect(a4.rawPayload.toString('latin1')).toContain('/MediaBox [0 0 841.89 595.28]');

    await harness.app.inject({
      method: 'PUT',
      url: '/v1/settings',
      headers: await harness.authorization(),
      payload: { country: 'US' },
    });

    const letter = await harness.app.inject({
      method: 'GET',
      url: `/v1/projects/${id}/cut-plan.pdf`,
      headers: await harness.authorization(),
    });

    expect(letter.rawPayload.toString('latin1')).toContain('/MediaBox [0 0 792 612]');
  });

  it('fige l’instantané : modifier le projet ne change pas l’export', async () => {
    const id = await createProject();
    const headers = await harness.authorization();

    const created = await harness.app.inject({
      method: 'POST',
      url: `/v1/projects/${id}/exports`,
      headers,
      payload: {},
    });

    expect(created.statusCode).toBe(201);

    // Le projet change après l'export.
    await harness.app.inject({
      method: 'PATCH',
      url: `/v1/projects/${id}`,
      headers,
      payload: {
        model: {
          ...REFERENCE,
          dimensions: { widthMm: 900, heightMm: 600, depthMm: 400 },
        },
      },
    });

    const snapshot = await harness.db
      .selectFrom('project_exports')
      .select('snapshot')
      .executeTakeFirstOrThrow();

    // Un plan parti à l'atelier ne change pas parce que le projet a bougé depuis.
    expect(
      (snapshot.snapshot as { model: { dimensions: { widthMm: number } } }).model
        .dimensions.widthMm,
    ).toBe(1800);
  });

  it('garde l’export même quand Storage n’a pas pu le ranger', async () => {
    // Aucune clé d'API n'est configurée dans le banc d'essai : le dépôt n'a pas lieu, et
    // l'export doit exister quand même.
    const id = await createProject();

    const created = await harness.app.inject({
      method: 'POST',
      url: `/v1/projects/${id}/exports`,
      headers: await harness.authorization(),
      payload: {},
    });

    expect(created.json().data.storage_object_id).toBeNull();

    const listed = await harness.app.inject({
      method: 'GET',
      url: `/v1/projects/${id}/exports`,
      headers: await harness.authorization(),
    });

    expect(listed.json().data).toHaveLength(1);
  });

  it('interdit l’export à qui ne peut pas écrire', async () => {
    const id = await createProject();

    const response = await harness.app.inject({
      method: 'POST',
      url: `/v1/projects/${id}/exports`,
      headers: await harness.authorization({ roles: ['billing_manager'] }),
      payload: {},
    });

    expect(response.statusCode).toBe(403);
  });
});
