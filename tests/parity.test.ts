import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build, cutList } from '@neftya/engine';
import { formatLength } from '@neftya/units';
import {
  createHarness,
  SAMPLE_MODEL,
  type Harness,
} from '../apps/api/src/test-support/harness.js';

/**
 * Le critère de sortie de la phase 3, en test.
 *
 * > « la sélection d'une pièce affiche les mêmes cotes que celles calculées côté serveur »
 *
 * L'interface construit le meuble **localement**, pour que faire glisser un curseur ne
 * parte pas en réseau. Le serveur le reconstruit pour ce qui fait foi. Si les deux
 * divergeaient, un menuisier scierait autre chose que ce qu'il a vu à l'écran.
 *
 * Ce test compare ce que l'interface afficherait à ce que le serveur répond, en passant
 * réellement par HTTP et par la sérialisation JSON.
 *
 * @see docs/IMPLEMENTATION.md — phase 3
 */

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness('test_parite');
});

afterAll(async () => {
  await harness.close();
});

const MODELS = [
  SAMPLE_MODEL,
  {
    dimensions: { widthMm: 2200, heightMm: 2400, depthMm: 600 },
    compartments: [
      { shelves: 4, drawers: 0 },
      { shelves: 0, drawers: 3 },
      { shelves: 2, drawers: 1 },
    ],
    material: 'plywood',
    hasBack: true,
  },
  {
    dimensions: { widthMm: 873, heightMm: 1500, depthMm: 300 },
    compartments: [{ shelves: 2, drawers: 0 }],
    material: 'solid_wood',
    hasBack: false,
  },
] as const;

describe('les deux côtés calculent le même meuble', () => {
  it.each(MODELS.map((model, index) => [index, model] as const))(
    'modèle %i : les pièces et la liste de découpe coïncident',
    async (_index, model) => {
      const created = await harness.app.inject({
        method: 'POST',
        url: '/v1/projects',
        headers: await harness.authorization(),
        payload: { name: 'Parité', model },
      });

      expect(created.statusCode).toBe(201);

      const stored = created.json().data.model;
      const response = await harness.app.inject({
        method: 'GET',
        url: `/v1/projects/${created.json().data.id}/build`,
        headers: await harness.authorization(),
      });

      // Ce que l'interface calcule dans le navigateur, à partir du modèle qu'elle a reçu.
      const local = build(stored);
      const body = response.json().data;

      expect(body.furniture.parts).toEqual(JSON.parse(JSON.stringify(local.parts)));
      expect(body.cutList).toEqual(JSON.parse(JSON.stringify(cutList(local))));
    },
  );

  it('les cotes affichées dans le panneau de sélection sont celles du serveur', async () => {
    const created = await harness.app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: await harness.authorization(),
      payload: { name: 'Sélection', model: SAMPLE_MODEL },
    });

    const response = await harness.app.inject({
      method: 'GET',
      url: `/v1/projects/${created.json().data.id}/build`,
      headers: await harness.authorization(),
    });

    const serverParts = response.json().data.furniture.parts as {
      id: string;
      lengthMm: number;
      widthMm: number;
    }[];
    const localParts = build(created.json().data.model).parts;

    for (const part of localParts) {
      const onServer = serverParts.find((candidate) => candidate.id === part.id);
      expect(onServer).toBeDefined();

      // La comparaison porte sur la chaîne affichée, dans les deux systèmes : c'est ce
      // que l'utilisateur lit, et donc ce qui doit coïncider.
      for (const system of ['metric', 'imperial'] as const) {
        expect(formatLength(part.lengthMm, system)).toBe(
          formatLength(onServer?.lengthMm as number, system),
        );
        expect(formatLength(part.widthMm, system)).toBe(
          formatLength(onServer?.widthMm as number, system),
        );
      }
    }
  });
});
