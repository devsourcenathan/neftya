import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SekuuAI } from '../sekuu/ai.js';
import {
  createHarness,
  ORGANIZATION_B,
  type Harness,
} from '../test-support/harness.js';

/**
 * Les deux routes de l'assistant.
 *
 * Ce qui est vérifié ici n'est pas l'appel à la plateforme — `ai.test.ts` s'en charge — mais
 * **ce que l'API décide** de ce qu'elle reçoit : qui a le droit de demander, ce qui se passe
 * sans clé, et le point le plus important — qu'une génération réussie dont la sortie ne
 * compose aucun meuble ne soit pas rendue comme un succès.
 */

let harness: Harness;
/** Sans clé : l'installation qui n'a pas configuré l'assistant. */
let sansAssistant: Harness;

/** Ce que la plateforme rendra, décidé test par test. */
let answer: () => Response;

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const succeeded = (output: Record<string, unknown>) =>
  json({ data: { id: 'gen-1', status: 'succeeded', output } });

const USABLE = {
  widthMm: 1800,
  heightMm: 2000,
  depthMm: 400,
  compartments: 2,
  shelvesPerCompartment: 1,
};

beforeAll(async () => {
  const ai = new SekuuAI({
    baseUrl: 'https://ai.sekuu.test',
    apiKey: 'cle-de-test',
    fetch: (() => Promise.resolve(answer())) as typeof globalThis.fetch,
  });

  harness = await createHarness('test_assistant', { ai });
  sansAssistant = await createHarness('test_assistant_sans_cle');
});

afterAll(async () => {
  await harness.close();
  await sansAssistant.close();
});

describe('soumettre une description', () => {
  it('rend 202 : acceptée, pas faite', async () => {
    answer = () => json({ data: { id: 'gen-1', status: 'queued' } }, 202);

    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/assistant/interpretations',
      headers: await harness.authorization(),
      payload: { text: 'une bibliothèque de 1800 sur 2000, deux compartiments' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().data).toMatchObject({ id: 'gen-1', status: 'queued' });
    // Rien n'est encore composé : annoncer un modèle ici obligerait le client à distinguer
    // « null parce que pas prêt » de « null parce que inutilisable ».
    expect(response.json().data.model).toBeNull();
  });

  it('rend le modèle tout de suite quand l’extraction est synchrone', async () => {
    // Une extraction locale répond `succeeded` dès la soumission. Annoncer la réussite
    // sans la porter obligeait l'appelant à sonder une génération déjà terminée — ou, s'il
    // croyait la réponse, à n'afficher rien du tout.
    answer = () => succeeded(USABLE);

    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/assistant/interpretations',
      headers: await harness.authorization(),
      payload: { text: 'une bibliothèque de 1800 sur 2000' },
    });

    // `200`, pas `202` : il n'y a plus rien à attendre.
    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('succeeded');
    expect(response.json().data.model.dimensions).toEqual({
      widthMm: 1800,
      heightMm: 2000,
      depthMm: 400,
    });
  });

  it('dit « inutilisable » dès la soumission, et pas « réussi »', async () => {
    answer = () => succeeded({ ...USABLE, heightMm: 2 });

    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/assistant/interpretations',
      headers: await harness.authorization(),
      payload: { text: 'une bibliothèque de 1,80 m' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('unusable');
    expect(response.json().data.problems).toHaveProperty('heightMm');
  });

  it('rend exactement la même ressource aux deux routes', async () => {
    answer = () => succeeded(USABLE);

    const submitted = await harness.app.inject({
      method: 'POST',
      url: '/v1/assistant/interpretations',
      headers: await harness.authorization(),
      payload: { text: 'une bibliothèque de 1800 sur 2000, pour comparer' },
    });

    const read = await harness.app.inject({
      method: 'GET',
      url: `/v1/assistant/interpretations/${submitted.json().data.id}`,
      headers: await harness.authorization(),
    });

    // Deux sérialisations d'une même ressource divergent toujours ; une seule ne peut pas.
    expect(read.json().data).toEqual(submitted.json().data);
  });

  it('facture une fois la même question, deux fois une autre', async () => {
    const keys: (string | undefined)[] = [];
    const ai = new SekuuAI({
      baseUrl: 'https://ai.sekuu.test',
      apiKey: 'cle',
      fetch: ((_input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
        keys.push((init?.headers as Record<string, string>)['Idempotency-Key']);
        return Promise.resolve(json({ data: { id: 'gen-1', status: 'queued' } }, 202));
      }) as typeof globalThis.fetch,
    });

    const banc = await createHarness('test_assistant_idempotence', { ai });
    const submit = async (text: string) =>
      await banc.app.inject({
        method: 'POST',
        url: '/v1/assistant/interpretations',
        headers: await banc.authorization(),
        payload: { text },
      });

    try {
      await submit('une bibliothèque de 1800');
      await submit('une bibliothèque de 1800');
      await submit('une bibliothèque de 1900');
    } finally {
      await banc.close();
    }

    // La clé dérive du texte : deux fois la même description est la même question, et elle
    // a déjà sa réponse. Une valeur tirée au hasard ferait payer chaque double-clic.
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('refuse une description vide', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/assistant/interpretations',
      headers: await harness.authorization(),
      payload: { text: '  ' },
    });

    expect(response.statusCode).toBe(422);
  });

  it('refuse un document entier', async () => {
    // Le coût est proportionnel à l'entrée : la borne est une protection de facture, pas
    // une préférence de forme.
    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/assistant/interpretations',
      headers: await harness.authorization(),
      payload: { text: 'a'.repeat(5_000) },
    });

    expect(response.statusCode).toBe(422);
  });

  it('refuse un rôle qui ne peut pas écrire', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/assistant/interpretations',
      headers: await harness.authorization({ roles: ['billing_manager'] }),
      payload: { text: 'une bibliothèque de 1800' },
    });

    // Qui ne peut pas créer de projet n'a aucune raison de pouvoir en faire rédiger un —
    // et une génération se paie.
    expect(response.statusCode).toBe(403);
  });

  it('exige une session', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/assistant/interpretations',
      payload: { text: 'une bibliothèque de 1800' },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('relire une interprétation', () => {
  it('rend le modèle composé quand la sortie est exploitable', async () => {
    answer = () => succeeded(USABLE);

    const response = await harness.app.inject({
      method: 'GET',
      url: '/v1/assistant/interpretations/gen-1',
      headers: await harness.authorization(),
    });

    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.status).toBe('succeeded');
    expect(data.model.dimensions).toEqual({
      widthMm: 1800,
      heightMm: 2000,
      depthMm: 400,
    });
    expect(data.model.compartments).toHaveLength(2);
  });

  it('dit « inutilisable » plutôt que de rendre un meuble faux', async () => {
    // Une hauteur de 2 mm : le modèle a lu « 1,80 m » et rendu des mètres. La génération a
    // réussi, elle a coûté, et son résultat ne fait pas un meuble.
    answer = () => succeeded({ ...USABLE, heightMm: 2 });

    const response = await harness.app.inject({
      method: 'GET',
      url: '/v1/assistant/interpretations/gen-1',
      headers: await harness.authorization(),
    });

    // `200` et non `422` : l'appel était bon, c'est la phrase qui ne disait pas de quoi
    // faire un meuble. Un 422 ferait réessayer au lieu de reformuler.
    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('unusable');
    expect(response.json().data.model).toBeNull();
    expect(response.json().data.problems).toHaveProperty('heightMm');
  });

  it('rend l’état tel quel tant que ce n’est pas fini', async () => {
    answer = () => json({ data: { id: 'gen-1', status: 'running' } });

    const response = await harness.app.inject({
      method: 'GET',
      url: '/v1/assistant/interpretations/gen-1',
      headers: await harness.authorization(),
    });

    expect(response.json().data.status).toBe('running');
    expect(response.json().data.model).toBeNull();
  });

  it('n’expose pas la génération d’une autre organisation', async () => {
    // La plateforme vérifie l'appartenance, mais c'est nous qui nommons l'organisation :
    // elle vient du jeton, jamais de la requête.
    const seen: string[] = [];
    const ai = new SekuuAI({
      baseUrl: 'https://ai.sekuu.test',
      apiKey: 'cle',
      fetch: ((input: Parameters<typeof globalThis.fetch>[0]) => {
        seen.push(String(input));
        return Promise.resolve(json({ data: { id: 'gen-1', status: 'running' } }));
      }) as typeof globalThis.fetch,
    });

    const autre = await createHarness('test_assistant_autre', { ai });
    try {
      await autre.app.inject({
        method: 'GET',
        url: '/v1/assistant/interpretations/gen-1',
        headers: await autre.authorization({ organizationId: ORGANIZATION_B }),
      });

      expect(seen[0]).toContain(`organization_id=${ORGANIZATION_B}`);
    } finally {
      await autre.close();
    }
  });
});

describe('ce que la plateforme refuse', () => {
  it('traduit un quota épuisé en 409, comme celui des projets', async () => {
    answer = () => json({ error: { code: 'AI_QUOTA_EXCEEDED' } }, 429);

    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/assistant/interpretations',
      headers: await harness.authorization(),
      payload: { text: 'une bibliothèque de 1800' },
    });

    /*
     * Ce test disait `503`, et c'était le défaut : le message annonçait un quota épuisé
     * pendant que le code annonçait un service indisponible. L'un invite à relever le
     * plafond, l'autre à attendre — et une interface ne peut pas traiter deux fois le même
     * refus si l'API le nomme de deux façons.
     */
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('CONFLICT');
    expect(response.json().error.message).toContain('abonnement');
  });

  it('ne parle pas d’abonnement quand c’est le plafond de la plateforme', async () => {
    answer = () => json({ error: { code: 'AI_SPEND_CAP_REACHED' } }, 429);

    const response = await harness.app.inject({
      method: 'POST',
      url: '/v1/assistant/interpretations',
      headers: await harness.authorization(),
      payload: { text: 'une bibliothèque de 1800' },
    });

    // Inviter quelqu'un à payer plus alors que c'est la plateforme qui s'est protégée
    // serait mensonger.
    expect(response.statusCode).toBe(503);
    expect(response.json().error.message).not.toContain('abonnement');
  });
});

describe('une installation sans clé', () => {
  it('dit que l’assistant n’est pas configuré', async () => {
    const response = await sansAssistant.app.inject({
      method: 'POST',
      url: '/v1/assistant/interpretations',
      headers: await sansAssistant.authorization(),
      payload: { text: 'une bibliothèque de 1800' },
    });

    // `503` nommé, et non `500` : rien n'est cassé dans Neftya, et un 500 ferait chercher
    // un défaut ici.
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('le dit aussi à la relecture', async () => {
    const response = await sansAssistant.app.inject({
      method: 'GET',
      url: '/v1/assistant/interpretations/gen-1',
      headers: await sansAssistant.authorization(),
    });

    expect(response.statusCode).toBe(503);
  });
});
