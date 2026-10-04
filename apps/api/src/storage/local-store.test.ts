import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHarness, type Harness } from '../test-support/harness.js';
import { LocalFileStore } from './local-store.js';
import { StorageUnavailable } from './file-store.js';

/**
 * Le magasin local : déposer, relire, cloisonner.
 *
 * Trois gardes portent tout : les octets relus sont ceux déposés, une
 * organisation ne relit pas le fichier d'une autre, et un nom vicieux
 * (`../`) ne fait pas sortir du répertoire.
 */

let harness: Harness;
let dataDir: string;
let store: LocalFileStore;

const ORGANIZATION = '01924f00-0000-7000-8000-00000000000a';
const OTHER_ORGANIZATION = '01924f00-0000-7000-8000-00000000000b';

beforeAll(async () => {
  harness = await createHarness('test_fichiers');
  dataDir = mkdtempSync(join(tmpdir(), 'neftya-fichiers-'));
  store = new LocalFileStore({ dataDir, db: harness.db });
});

afterAll(async () => {
  await harness.close();
  rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await harness.truncate();
});

describe('dépôt et relecture', () => {
  it('relit les octets déposés, avec leur type et leur nom', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const id = await store.upload({
      organizationId: ORGANIZATION,
      ownerId: ORGANIZATION,
      name: 'bibliotheque.pdf',
      mimeType: 'application/pdf',
      bytes,
    });

    const stored = await store.download(ORGANIZATION, id);
    expect(stored?.bytes).toEqual(bytes);
    expect(stored?.mimeType).toBe('application/pdf');
    expect(stored?.name).toBe('bibliotheque.pdf');
  });

  it('rend null pour un inconnu comme pour un fichier d’autrui', async () => {
    const id = await store.upload({
      organizationId: ORGANIZATION,
      ownerId: ORGANIZATION,
      name: 'secret.pdf',
      mimeType: 'application/pdf',
      bytes: new Uint8Array([1, 2, 3]),
    });

    // Même réponse dans les deux cas : distinguer dirait lesquels existent.
    expect(await store.download(OTHER_ORGANIZATION, id)).toBeNull();
    expect(
      await store.download(ORGANIZATION, '01924f00-0000-7000-8000-ffffffffffff'),
    ).toBeNull();
  });

  it('ne laisse pas un nom vicieux sortir du répertoire', async () => {
    const id = await store.upload({
      organizationId: ORGANIZATION,
      ownerId: ORGANIZATION,
      name: '../../echappe.pdf',
      mimeType: 'application/pdf',
      bytes: new Uint8Array([9]),
    });

    const stored = await store.download(ORGANIZATION, id);
    expect(stored?.bytes).toEqual(new Uint8Array([9]));
  });

  it('refuse un fichier démesuré sans rien écrire', async () => {
    await expect(
      store.upload({
        organizationId: ORGANIZATION,
        ownerId: ORGANIZATION,
        name: 'enorme.pdf',
        mimeType: 'application/pdf',
        bytes: new Uint8Array(51 * 1024 * 1024),
      }),
    ).rejects.toBeInstanceOf(StorageUnavailable);

    const count = await harness.db
      .selectFrom('files')
      .select('id')
      .where('organization_id', '=', ORGANIZATION)
      .execute();
    expect(count).toHaveLength(0);
  });
});

describe('export déposé et retéléchargé', () => {
  it('fige, dépose, et rend les mêmes octets', async () => {
    const deposited = await createHarness('test_export_depose', { storage: 'local' });
    try {
      const project = await deposited.app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: await deposited.authorization(),
        payload: {
          name: 'Bibliothèque',
          model: {
            dimensions: { widthMm: 1800, heightMm: 600, depthMm: 400 },
            compartments: [
              { shelves: 1, drawers: 0 },
              { shelves: 1, drawers: 0 },
            ],
            material: 'mdf',
            hasBack: true,
          },
        },
      });
      expect(project.statusCode).toBe(201);
      const projectId = project.json().data.id as string;

      const exported = await deposited.app.inject({
        method: 'POST',
        url: `/v1/projects/${projectId}/exports`,
        headers: await deposited.authorization(),
      });
      expect(exported.statusCode).toBe(201);
      expect(exported.json().data.storage_object_id).toBeTypeOf('string');
      const exportId = exported.json().data.id as string;

      const file = await deposited.app.inject({
        method: 'GET',
        url: `/v1/exports/${exportId}/file`,
        headers: await deposited.authorization(),
      });
      expect(file.statusCode).toBe(200);
      expect(file.headers['content-type']).toBe('application/pdf');

      // Le même plan, servi recomputé : les octets figés sont ceux du plan.
      const recomputed = await deposited.app.inject({
        method: 'GET',
        url: `/v1/projects/${projectId}/cut-plan.pdf`,
        headers: await deposited.authorization(),
      });
      expect(recomputed.statusCode).toBe(200);
      expect(file.rawPayload.equals(recomputed.rawPayload)).toBe(true);

      // Une autre organisation obtient 404, pas le plan d'autrui.
      const foreign = await deposited.app.inject({
        method: 'GET',
        url: `/v1/exports/${exportId}/file`,
        headers: await deposited.authorization({
          organizationId: '01924f00-0000-7000-8000-00000000000b',
        }),
      });
      expect(foreign.statusCode).toBe(404);
    } finally {
      await deposited.close();
    }
  });

  it('sans relecture câblée, le téléchargement rend 404', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/v1/exports/01924f00-0000-7000-8000-00000000000a/file',
      headers: await harness.authorization(),
    });
    expect(response.statusCode).toBe(404);
  });
});
