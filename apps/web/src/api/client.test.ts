// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiRequestError, createFileClient, saveBlob } from './client.js';

/**
 * Le téléchargement de fichiers.
 *
 * Ce test existe à cause d'un défaut réel : les deux boutons de téléchargement étaient de
 * simples `<a href>`, et un lien de navigateur **ne porte pas d'en-tête**. L'API répondait
 * `401` et l'utilisateur recevait le JSON d'erreur à la place de son fichier. Aucun test ne
 * l'a vu — côté API on passe toujours un jeton, côté interface personne n'avait cliqué.
 */

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // happy-dom n'implémente pas les URL d'objet : sans cela, `saveBlob` lève.
  URL.createObjectURL = vi.fn(() => 'blob:essai');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function respondWith(response: Partial<Response>) {
  const fetch = vi.fn(async () => response as Response);
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
  return fetch;
}

describe('téléchargement', () => {
  it('envoie le jeton — ce qu’un lien de navigateur ne fait pas', async () => {
    const fetch = respondWith({
      ok: true,
      status: 200,
      blob: async () => new Blob(['id;longueur_mm']),
    });

    const download = createFileClient(async () => 'jeton-de-test');
    await download('/v1/projects/1/cut-list.csv', 'projet.csv');

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['authorization']).toBe(
      'Bearer jeton-de-test',
    );
  });

  it('remet le fichier au navigateur sous le nom demandé', async () => {
    respondWith({ ok: true, status: 200, blob: async () => new Blob(['x']) });

    const clicked: string[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this.download);
      });

    const download = createFileClient(async () => 'jeton');
    await download('/v1/projects/1/plans.pdf', 'bibliotheque-plans.pdf');

    expect(clicked).toEqual(['bibliotheque-plans.pdf']);
    click.mockRestore();
  });

  it('relâche l’URL d’objet — sinon un onglet ouvert les accumule', async () => {
    respondWith({ ok: true, status: 200, blob: async () => new Blob(['x']) });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await createFileClient(async () => 'jeton')('/v1/x.pdf', 'x.pdf');

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:essai');
  });

  it('rend l’erreur de la plateforme plutôt qu’un fichier vide', async () => {
    respondWith({
      ok: false,
      status: 403,
      json: async () => ({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Interdit.' },
        meta: { request_id: 'req-1' },
      }),
    });

    const download = createFileClient(async () => 'jeton');

    // Un `<a href>` aurait affiché ce JSON dans un onglet, et l'utilisateur aurait cru
    // que le fichier était corrompu.
    await expect(download('/v1/x.pdf', 'x.pdf')).rejects.toBeInstanceOf(
      ApiRequestError,
    );
    await expect(download('/v1/x.pdf', 'x.pdf')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  it('ne laisse pas passer une réponse d’erreur sans enveloppe', async () => {
    // Un mandataire ou un pare-feu peut rendre du HTML : le client ne doit pas le prendre
    // pour un fichier.
    respondWith({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('pas du JSON');
      },
    });

    await expect(
      createFileClient(async () => 'jeton')('/v1/x.pdf', 'x.pdf'),
    ).rejects.toMatchObject({ status: 502, code: 'INTERNAL_ERROR' });
  });
});

describe('saveBlob', () => {
  it('ne laisse aucun lien derrière lui dans le document', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    saveBlob(new Blob(['x']), 'essai.txt');

    expect(document.querySelectorAll('a')).toHaveLength(0);
  });
});
