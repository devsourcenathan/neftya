import { describe, it, expect } from 'vitest';
import { AiUnavailable, SekuuAI, type AiRefusal } from './ai.js';

/**
 * Le client de Sekuu AI.
 *
 * Trois choses se vérifient ici, et chacune coûte de l'argent quand elle est fausse :
 *
 *  1. **La clé d'idempotence part**, sinon un double-clic est une génération de plus,
 *     facturée.
 *  2. **La sortie n'est lue qu'en cas de succès**, sinon un résultat partiel s'affiche
 *     comme s'il était complet.
 *  3. **Le quota et le plafond de dépense ne se confondent pas** : le premier se résout en
 *     changeant de plan, le second non, et le suggérer serait mensonger.
 *
 * Aucun appel ne sort : le `fetch` est injecté.
 */

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function platform(responses: (() => Response)[] | (() => Response)) {
  const calls: Call[] = [];
  const queue = Array.isArray(responses) ? [...responses] : null;

  const fetcher = (async (
    input: Parameters<typeof globalThis.fetch>[0],
    init?: RequestInit,
  ) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });

    const next = queue ? queue.shift() : (responses as () => Response);
    if (!next) throw new Error('Appel non prévu.');
    return next();
  }) as typeof globalThis.fetch;

  return {
    calls,
    ai: new SekuuAI({
      baseUrl: 'https://ai.sekuu.test',
      apiKey: 'cle-de-test',
      fetch: fetcher,
    }),
  };
}

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const accepted = (overrides: Record<string, unknown> = {}) =>
  json({ data: { id: 'gen-1', status: 'queued', ...overrides } }, 202);

const EXTRACTION = {
  organizationId: 'org-1',
  input: 'une bibliothèque de 1800 de large',
  fields: ['widthMm'],
  idempotencyKey: 'neftya:interpret:org-1:abc',
};

describe('soumettre une extraction', () => {
  it('nomme la tâche, jamais le modèle', async () => {
    const { ai, calls } = platform(accepted);

    await ai.extract(EXTRACTION);

    const body = calls[0]?.body as Record<string, unknown>;
    expect(body['task']).toBe('extract');
    // L'API refuse un champ `model`, elle ne l'ignore pas : l'envoyer ferait rejeter
    // l'appel entier.
    expect(body).not.toHaveProperty('model');
  });

  it('nomme l’organisation qui paie', async () => {
    const { ai, calls } = platform(accepted);

    await ai.extract(EXTRACTION);

    const body = calls[0]?.body as Record<string, unknown>;
    // Sans elle, la génération ne serait imputée à personne — ni pour le quota, ni pour
    // la facture.
    expect(body['organization_id']).toBe('org-1');
  });

  it('porte la clé d’idempotence', async () => {
    const { ai, calls } = platform(accepted);

    await ai.extract(EXTRACTION);

    // Sans cet en-tête, un réessai de navigateur est une seconde génération, facturée.
    expect(calls[0]?.headers['Idempotency-Key']).toBe(EXTRACTION.idempotencyKey);
  });

  it('s’authentifie par la clé d’API, pas par un jeton d’utilisateur', async () => {
    const { ai, calls } = platform(accepted);

    await ai.extract(EXTRACTION);

    expect(calls[0]?.headers['authorization']).toBe('Bearer cle-de-test');
  });
});

describe('lire l’issue', () => {
  it('nomme l’organisation en chaîne de requête', async () => {
    const { ai, calls } = platform(() =>
      json({ data: { id: 'gen-1', status: 'running' } }),
    );

    await ai.read('org-1', 'gen-1');

    // Sans elle, la même clé lirait chez une organisation ce qu'elle a produit chez une
    // autre.
    expect(calls[0]?.url).toContain('organization_id=org-1');
    expect(calls[0]?.method).toBe('GET');
  });

  it('rend la sortie quand c’est réussi', async () => {
    const { ai } = platform(() =>
      json({ data: { id: 'gen-1', status: 'succeeded', output: { widthMm: 1800 } } }),
    );

    const generation = await ai.read('org-1', 'gen-1');

    expect(generation.output).toEqual({ widthMm: 1800 });
  });

  it('décode une sortie rendue en chaîne JSON', async () => {
    const { ai } = platform(() =>
      json({ data: { id: 'gen-1', status: 'succeeded', output: '{"widthMm":1800}' } }),
    );

    expect((await ai.read('org-1', 'gen-1')).output).toEqual({ widthMm: 1800 });
  });

  it('ne lit pas la sortie d’une génération échouée', async () => {
    const { ai } = platform(() =>
      json({ data: { id: 'gen-1', status: 'failed', output: { widthMm: 1800 } } }),
    );

    // Une génération échouée a brûlé des jetons sans rien produire qu'on puisse proposer.
    // Lire `output` sans regarder `status` afficherait un résultat partiel comme complet.
    expect((await ai.read('org-1', 'gen-1')).output).toBeNull();
  });

  it('refuse une sortie qui n’est pas un objet', async () => {
    const { ai } = platform(() =>
      json({
        data: { id: 'gen-1', status: 'succeeded', output: 'désolé, je ne sais pas' },
      }),
    );

    // Laisser une chaîne se propager là où un enregistrement est attendu casserait plus
    // loin, et sur une pile qui ne nommerait pas la cause.
    expect((await ai.read('org-1', 'gen-1')).output).toBeNull();
  });
});

describe('ce que la plateforme refuse', () => {
  const refusal = async (
    status: number,
    code: string | undefined,
  ): Promise<AiRefusal | 'aucun'> => {
    const { ai } = platform(() => json({ error: code ? { code } : undefined }, status));

    try {
      await ai.extract(EXTRACTION);
      return 'aucun';
    } catch (error) {
      return error instanceof AiUnavailable ? error.refusal : 'aucun';
    }
  };

  it('distingue le quota du plafond de dépense', async () => {
    // Les deux partagent le même 429. Les confondre inviterait quelqu'un à changer de plan
    // alors que c'est la plateforme qui s'est protégée.
    expect(await refusal(429, 'AI_QUOTA_EXCEEDED')).toBe('quota');
    expect(await refusal(429, 'AI_SPEND_CAP_REACHED')).toBe('spend_cap');
  });

  it('reconnaît le quota sous son nom générique', async () => {
    expect(await refusal(429, 'QUOTA_EXCEEDED')).toBe('quota');
  });

  it('distingue une clé refusée', async () => {
    // Une tâche absente de la liste blanche de la clé, ou une clé révoquée : ce n'est pas
    // une panne, et réessayer ne servira à rien.
    expect(await refusal(403, undefined)).toBe('denied');
    expect(await refusal(401, undefined)).toBe('denied');
  });

  it('retombe sur « indisponible » pour le reste', async () => {
    expect(await refusal(503, undefined)).toBe('unavailable');
  });

  it('traite une panne de réseau comme une indisponibilité', async () => {
    const ai = new SekuuAI({
      baseUrl: 'https://ai.sekuu.test',
      apiKey: 'cle',
      fetch: (() => Promise.reject(new Error('ENOTFOUND'))) as typeof globalThis.fetch,
    });

    await expect(ai.extract(EXTRACTION)).rejects.toThrow(AiUnavailable);
  });

  it('ne se noie pas dans une réponse illisible', async () => {
    const { ai } = platform(() => new Response('<html>502</html>', { status: 502 }));

    // Un corps qui n'est pas du JSON ne doit pas remonter en erreur d'analyse : la cause
    // est la panne, pas le format.
    await expect(ai.extract(EXTRACTION)).rejects.toThrow(AiUnavailable);
  });
});
