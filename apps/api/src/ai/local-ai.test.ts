import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHarness, type Harness } from '../test-support/harness.js';
import { LocalAI } from './local-ai.js';
import { AiUnavailable } from '../sekuu/ai.js';

/**
 * L'IA locale, sans modèle.
 *
 * Le fournisseur est un `fetch` injecté qui parle OpenAI : ce qui est éprouvé
 * ici, c'est **ce que Neftya décide** — l'idempotence qui ne facture pas deux
 * fois, le quota compté en lignes, et chaque refus traduit sans mentir.
 */

let harness: Harness;
let calls: number;

const ORGANIZATION = '01924f00-0000-7000-8000-00000000000a';

const EXTRACTION = {
  widthMm: 1800,
  heightMm: 2000,
  depthMm: 400,
  compartments: 2,
  shelvesPerCompartment: 1,
};

function completion(output: unknown, status = 200) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

function localAi(respond: () => Response | Promise<Response>): LocalAI {
  return new LocalAI({
    db: harness.db,
    baseUrl: 'https://modele.test/v1',
    apiKey: 'cle-de-test',
    model: 'modele-de-test',
    fetch: (async () => {
      calls += 1;
      return respond();
    }) as typeof globalThis.fetch,
  });
}

const REQUEST = {
  organizationId: ORGANIZATION,
  input: 'une bibliothèque de 1800 sur 2000, deux compartiments',
  fields: ['widthMm', 'heightMm', 'depthMm', 'compartments', 'shelvesPerCompartment'],
  idempotencyKey: 'neftya:interpret:org:cle-1',
};

beforeAll(async () => {
  harness = await createHarness('test_ia_locale');
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.truncate();
  calls = 0;
});

describe('extraire', () => {
  it('rend la sortie du modèle, relisible à l’identique', async () => {
    const ai = localAi(() => completion(EXTRACTION));

    const generation = await ai.extract(REQUEST);

    expect(generation.status).toBe('succeeded');
    expect(generation.output).toMatchObject({ widthMm: 1800, compartments: 2 });
    expect(calls).toBe(1);

    const reread = await ai.read(ORGANIZATION, generation.id);
    expect(reread).toEqual(generation);
  });

  it('ne facture pas deux fois la même question', async () => {
    const ai = localAi(() => completion(EXTRACTION));

    const first = await ai.extract(REQUEST);
    const second = await ai.extract(REQUEST);

    expect(second.id).toBe(first.id);
    expect(calls).toBe(1);
  });

  it('rend failed quand le modèle ne rend pas du JSON', async () => {
    const ai = localAi(
      () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'voici un meuble' } }] }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    );

    const generation = await ai.extract(REQUEST);

    expect(generation.status).toBe('failed');
    expect(generation.output).toBeNull();
  });

  it('garde le brut du modèle quand la sortie est inexploitable', async () => {
    const ai = localAi(
      () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'voici un meuble' } }] }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    );

    const generation = await ai.extract(REQUEST);

    // Sans le brut, un `failed` ne dit pas si le modèle a déraillé, si la
    // réponse est tronquée, ou si le fournisseur ignore `response_format`.
    const row = await harness.db
      .selectFrom('ai_generations')
      .select('raw_output')
      .where('id', '=', generation.id)
      .executeTakeFirstOrThrow();
    expect(row.raw_output).toContain('voici un meuble');
  });

  it('traduit une clé refusée en denied, pas en panne', async () => {
    const ai = localAi(() => new Response('{}', { status: 401 }));

    await expect(ai.extract(REQUEST)).rejects.toMatchObject({ refusal: 'denied' });
  });

  it('traduit un modèle muet en unavailable', async () => {
    const ai = localAi(() => {
      throw new TypeError('Failed to fetch');
    });

    await expect(ai.extract(REQUEST)).rejects.toMatchObject({ refusal: 'unavailable' });
  });

  it('ne lit pas la génération d’une autre organisation', async () => {
    const ai = localAi(() => completion(EXTRACTION));
    const generation = await ai.extract(REQUEST);

    await expect(
      ai.read('01924f00-0000-7000-8000-00000000000b', generation.id),
    ).rejects.toBeInstanceOf(AiUnavailable);
  });

  it('budgete large et bride la réflexion quand on le lui demande', async () => {
    const bodies: Record<string, unknown>[] = [];
    const ai = new LocalAI({
      db: harness.db,
      baseUrl: 'https://modele.test/v1',
      apiKey: 'cle-de-test',
      model: 'modele-de-test',
      reasoningEffort: 'minimal',
      fetch: (async (_input: unknown, init?: { body?: unknown }) => {
        bodies.push(
          JSON.parse(String((init as { body: string }).body)) as Record<
            string,
            unknown
          >,
        );
        return completion(EXTRACTION);
      }) as typeof globalThis.fetch,
    });

    await ai.extract(REQUEST);

    // 500 a déjà fait perdre une réponse : la réflexion avait tout brûlé.
    expect(bodies[0]?.['max_tokens']).toBe(2000);
    expect(bodies[0]?.['reasoning_effort']).toBe('minimal');
  });

  it('omet la bride quand le relais ne la connaîtrait pas', async () => {
    const bodies: Record<string, unknown>[] = [];
    const ai = new LocalAI({
      db: harness.db,
      baseUrl: 'https://modele.test/v1',
      apiKey: 'cle-de-test',
      model: 'modele-de-test',
      fetch: (async (_input: unknown, init?: { body?: unknown }) => {
        bodies.push(
          JSON.parse(String((init as { body: string }).body)) as Record<
            string,
            unknown
          >,
        );
        return completion(EXTRACTION);
      }) as typeof globalThis.fetch,
    });

    await ai.extract(REQUEST);

    expect(bodies[0]).not.toHaveProperty('reasoning_effort');
  });
});

describe('quota mensuel', () => {
  beforeEach(async () => {
    await harness.truncate();
    calls = 0;
    await harness.db
      .insertInto('users')
      .values({
        id: '01924f00-0000-7000-8000-0000000000a1',
        email: 'quota@atelier.test',
        password_hash: 'scrypt$16384$8$1$sel$hash',
        first_name: 'Quota',
        last_name: 'Test',
        language: 'fr',
      })
      .execute();
    await harness.db
      .insertInto('organizations')
      .values({
        id: ORGANIZATION,
        name: 'Atelier Quota',
        slug: 'atelier-quota',
        created_by: '01924f00-0000-7000-8000-0000000000a1',
      })
      .execute();
  });

  it('bloque au plafond, sans appeler le modèle', async () => {
    await harness.db
      .insertInto('organization_quotas')
      .values({ organization_id: ORGANIZATION, projects_max: null, ai_month_max: 1 })
      .execute();

    const ai = localAi(() => completion(EXTRACTION));
    await ai.extract(REQUEST);

    await expect(
      ai.extract({ ...REQUEST, idempotencyKey: 'neftya:interpret:org:cle-2' }),
    ).rejects.toMatchObject({ refusal: 'quota' });
    expect(calls).toBe(1);
  });

  it('sans plafond, ne compte pas — et ne bloque pas', async () => {
    const ai = localAi(() => completion(EXTRACTION));
    await ai.extract(REQUEST);
    await ai.extract({ ...REQUEST, idempotencyKey: 'neftya:interpret:org:cle-2' });
    expect(calls).toBe(2);
  });
});

describe('bout en bout par l’API', () => {
  const local = (respond: () => Response | Promise<Response>) => (db: Harness['db']) =>
    new LocalAI({
      db,
      baseUrl: 'https://modele.test/v1',
      apiKey: 'cle-de-test',
      model: 'modele-de-test',
      fetch: (async () => respond()) as typeof globalThis.fetch,
    });

  it('soumet puis lit une interprétation utilisable', async () => {
    const wired = await createHarness('test_ia_locale_bout_en_bout', {
      ai: local(() => completion(EXTRACTION)),
    });
    try {
      const submit = await wired.app.inject({
        method: 'POST',
        url: '/v1/assistant/interpretations',
        headers: await wired.authorization(),
        payload: { text: 'une bibliothèque de 1800 sur 2000, deux compartiments' },
      });
      // `200` et non `202` : l'extraction locale est synchrone, donc il ne reste rien à
      // attendre — et la réponse porte déjà le modèle.
      expect(submit.statusCode).toBe(200);
      expect(submit.json().data.status).toBe('succeeded');
      expect(submit.json().data.model).not.toBeNull();

      const read = await wired.app.inject({
        method: 'GET',
        url: `/v1/assistant/interpretations/${submit.json().data.id}`,
        headers: await wired.authorization(),
      });
      expect(read.statusCode).toBe(200);
      expect(read.json().data.status).toBe('succeeded');
      expect(read.json().data.model).not.toBeNull();
    } finally {
      await wired.close();
    }
  });

  it('rend 404 sur une génération inconnue', async () => {
    const wired = await createHarness('test_ia_locale_404', {
      ai: local(() => completion(EXTRACTION)),
    });
    try {
      // Base du banc principal : la génération n'y est jamais — 404, pas 503.
      const read = await wired.app.inject({
        method: 'GET',
        url: '/v1/assistant/interpretations/01924f00-0000-7000-8000-00000000000a',
        headers: await wired.authorization(),
      });
      expect(read.statusCode).toBe(404);
    } finally {
      await wired.close();
    }
  });
});
