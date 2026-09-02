import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { build } from '@neftya/engine';
import {
  createHarness,
  ORGANIZATION_A,
  ORGANIZATION_B,
  type Harness,
} from '../test-support/harness.js';
import { CATALOGUE } from './catalogue.js';

/**
 * Les modèles.
 *
 * Deux règles, et elles portent tout le reste : **le nom est de la donnée traduite**, et
 * **une organisation peut créer les siens**.
 */

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness('test_modeles');
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.truncate();
});

const ETABLI = {
  name: { fr: 'Établi d’atelier', en: 'Workbench' },
  model: {
    dimensions: { widthMm: 1600, heightMm: 900, depthMm: 600 },
    compartments: [{ shelves: 1, drawers: 0, doors: 0 }],
  },
};

async function list(language = 'fr') {
  const response = await harness.app.inject({
    method: 'GET',
    url: '/v1/templates',
    headers: await harness.authorization({ language }),
  });

  expect(response.statusCode).toBe(200);
  return response.json().data as {
    id: string;
    source: string;
    name: string;
    name_translations: Record<string, string>;
  }[];
}

describe('catalogue livré avec le produit', () => {
  it('est servi à qui n’a rien créé', async () => {
    const templates = await list();

    expect(templates).toHaveLength(CATALOGUE.length);
    expect(templates.every((template) => template.source === 'catalogue')).toBe(true);
  });

  it('produit des meubles que le moteur sait construire', async () => {
    // Un catalogue qui livrerait un modèle impossible ferait échouer le premier geste du
    // premier utilisateur.
    for (const template of CATALOGUE) {
      const furniture = build(template.model);

      expect(furniture.parts.length).toBeGreaterThan(0);
      for (const part of furniture.parts) {
        expect(part.lengthMm).toBeGreaterThan(0);
        expect(part.widthMm).toBeGreaterThan(0);
      }
    }
  });

  it('porte des slugs uniques, non traduits', async () => {
    const slugs = CATALOGUE.map((template) => template.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
    // Un slug est un identifiant : il ne se traduit pas, il n'a pas d'accent.
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/u);
  });

  it('ne se supprime pas : il appartient au produit', async () => {
    const response = await harness.app.inject({
      method: 'DELETE',
      url: '/v1/templates/catalogue:bookcase',
      headers: await harness.authorization(),
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('nom traduit', () => {
  it('résout à la langue du jeton', async () => {
    const francais = await list('fr');
    const anglais = await list('en');

    expect(francais.find((t) => t.id === 'catalogue:tv-unit')?.name).toBe('Meuble TV');
    expect(anglais.find((t) => t.id === 'catalogue:tv-unit')?.name).toBe('TV unit');
  });

  it('retombe sur le français pour une langue que le modèle ne porte pas', async () => {
    await harness.app.inject({
      method: 'POST',
      url: '/v1/templates',
      headers: await harness.authorization(),
      // Une organisation nomme son modèle en français et ne traduit pas : c'est le cas
      // courant, et il ne doit pas produire une clé technique à l'écran.
      payload: { name: { fr: 'Établi d’atelier' }, model: ETABLI.model },
    });

    const anglais = await list('en');
    const mien = anglais.find((template) => template.source === 'organization');

    expect(mien?.name).toBe('Établi d’atelier');
  });

  it('rend aussi les traductions brutes, pour qui veut les modifier', async () => {
    const templates = await list();
    const buffet = templates.find((template) => template.id === 'catalogue:sideboard');

    expect(buffet?.name_translations).toEqual({ fr: 'Buffet', en: 'Sideboard' });
  });

  it('refuse un nom sans français', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/templates',
      headers: await harness.authorization(),
      payload: { name: { en: 'Workbench' }, model: ETABLI.model },
    });

    // Sans la langue de référence, il n'y a pas de repli possible.
    expect(response.statusCode).toBe(422);
    expect(Object.keys(response.json().error.details)).toContain('name.fr');
  });
});

describe('modèles d’une organisation', () => {
  const create = async (
    payload: Record<string, unknown>,
    organizationId = ORGANIZATION_A,
  ) =>
    await harness.app.inject({
      method: 'POST',
      url: '/v1/templates',
      headers: await harness.authorization({ organizationId }),
      payload,
    });

  it('s’ajoutent au catalogue sans le remplacer', async () => {
    expect((await create(ETABLI)).statusCode).toBe(201);

    const templates = await list();

    expect(templates).toHaveLength(CATALOGUE.length + 1);
    expect(templates.filter((t) => t.source === 'organization')).toHaveLength(1);
  });

  it('normalisent le modèle par le schéma du moteur', async () => {
    const created = await create(ETABLI);

    // Les valeurs par défaut — matériau, fond, paramètres — viennent du moteur, pas du
    // client : un modèle enregistré à moitié rempli produirait un meuble différent selon
    // qui l'ouvre.
    const model = created.json().data.model;

    expect(model.material).toBe('mdf');
    expect(model.hasBack).toBe(true);
    expect(model.parameters).toBeDefined();
  });

  it('se suppriment', async () => {
    const created = await create(ETABLI);

    const deleted = await harness.app.inject({
      method: 'DELETE',
      url: `/v1/templates/${created.json().data.id}`,
      headers: await harness.authorization(),
    });

    expect(deleted.statusCode).toBe(204);
    expect(await list()).toHaveLength(CATALOGUE.length);
  });

  it('sont cloisonnés entre organisations', async () => {
    await create(ETABLI, ORGANIZATION_A);

    const chezB = await harness.app.inject({
      method: 'GET',
      url: '/v1/templates',
      headers: await harness.authorization({ organizationId: ORGANIZATION_B }),
    });

    // B voit le catalogue du produit, et rien de A.
    expect(chezB.json().data).toHaveLength(CATALOGUE.length);
  });

  it('ne se suppriment pas depuis une autre organisation', async () => {
    const created = await create(ETABLI, ORGANIZATION_A);

    const response = await harness.app.inject({
      method: 'DELETE',
      url: `/v1/templates/${created.json().data.id}`,
      headers: await harness.authorization({ organizationId: ORGANIZATION_B }),
    });

    expect(response.statusCode).toBe(404);
    expect(await list()).toHaveLength(CATALOGUE.length + 1);
  });

  it('interdit la création à qui ne peut pas écrire', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/templates',
      headers: await harness.authorization({ roles: ['billing_manager'] }),
      payload: ETABLI,
    });

    expect(response.statusCode).toBe(403);
  });
});
