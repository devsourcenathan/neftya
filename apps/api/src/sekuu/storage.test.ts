import { describe, it, expect, vi } from 'vitest';
import { SekuuStorage, StorageUnavailable } from './storage.js';

/**
 * Le dépôt chez Storage, sans appeler la plateforme.
 *
 * Le `fetch` est injecté : tester une intégration en la contactant vraiment donne une
 * suite qui échoue quand le réseau tousse, et qui ne dit rien quand le contrat change.
 */

function fakeFetch(responses: { status: number; body?: unknown }[]): {
  fetch: typeof globalThis.fetch;
  calls: { url: string; method: string }[];
} {
  const calls: { url: string; method: string }[] = [];
  let index = 0;

  const fetch = vi.fn(async (url: unknown, init?: { method?: string }) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET' });
    const response = responses[index++] ?? { status: 500 };

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body ?? {},
    };
  });

  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

const REQUEST = {
  organizationId: '01924f00-0000-7000-8000-00000000000a',
  ownerId: '01924f00-0000-7000-8000-0000000000c1',
  name: 'bibliotheque.pdf',
  mimeType: 'application/pdf',
  bytes: new Uint8Array([1, 2, 3]),
};

const DECLARED = {
  status: 201,
  body: {
    data: { id: 'file-42', upload_url: 'https://magasin.test/objet?signature=x' },
  },
};

describe('dépôt', () => {
  it('déclare, écrit les octets, puis confirme — dans cet ordre', async () => {
    const { fetch, calls } = fakeFetch([DECLARED, { status: 200 }, { status: 200 }]);
    const storage = new SekuuStorage({
      baseUrl: 'https://storage.test',
      apiKey: 'clé',
      fetch,
    });

    expect(await storage.upload(REQUEST)).toBe('file-42');

    expect(calls).toEqual([
      { url: 'https://storage.test/api/v1/files', method: 'POST' },
      // Les octets vont au magasin, pas à la plateforme.
      { url: 'https://magasin.test/objet?signature=x', method: 'PUT' },
      // Sans la confirmation, le fichier existe dans le magasin et n'existe pas pour la
      // plateforme.
      { url: 'https://storage.test/api/v1/files/file-42/confirm', method: 'POST' },
    ]);
  });

  it('échoue proprement quand la déclaration est refusée', async () => {
    const { fetch } = fakeFetch([{ status: 403 }]);
    const storage = new SekuuStorage({
      baseUrl: 'https://storage.test',
      apiKey: 'clé',
      fetch,
    });

    await expect(storage.upload(REQUEST)).rejects.toBeInstanceOf(StorageUnavailable);
  });

  it('échoue quand la déclaration ne rend pas d’URL', async () => {
    const { fetch } = fakeFetch([{ status: 201, body: { data: { id: 'file-42' } } }]);
    const storage = new SekuuStorage({
      baseUrl: 'https://storage.test',
      apiKey: 'clé',
      fetch,
    });

    await expect(storage.upload(REQUEST)).rejects.toThrow(/incomplète/u);
  });

  it('ne confirme pas un dépôt qui a échoué', async () => {
    const { fetch, calls } = fakeFetch([DECLARED, { status: 500 }]);
    const storage = new SekuuStorage({
      baseUrl: 'https://storage.test',
      apiKey: 'clé',
      fetch,
    });

    await expect(storage.upload(REQUEST)).rejects.toThrow(/refusé/u);
    // Confirmer un fichier absent du magasin le rendrait illisible sans que rien ne le
    // signale : Storage interroge le magasin, mais le quota, lui, serait déjà entamé.
    expect(calls).toHaveLength(2);
  });
});
