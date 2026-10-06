// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ApiClient } from '../api/client.js';
import { ApiRequestError } from '../api/client.js';
import { MAX_IMAGE_BYTES } from '../api/assistant.js';
import { renderWithProviders } from '../test-support/render.js';
import { Assistant } from './Assistant.js';

/**
 * L'assistant, vu de l'écran.
 *
 * Le point qui compte n'est pas qu'une configuration s'affiche : c'est que **rien ne soit
 * créé avant que quelqu'un l'ait regardée**. Une interprétation peut être plausible et
 * fausse, et la seule personne capable de le voir est celle qui a écrit la phrase.
 */

const MODEL = {
  dimensions: { widthMm: 1800, heightMm: 2000, depthMm: 400 },
  compartments: [
    { shelves: 2, drawers: 0, doors: 1, pulls: [], shelfSpacesMm: [] },
    { shelves: 2, drawers: 0, doors: 1, pulls: [], shelfSpacesMm: [] },
  ],
  material: 'mdf',
  hasBack: true,
  respectGrain: false,
  parameters: {},
};

/**
 * Une API scriptée : ce que rend le `POST`, puis ce que rend le `GET`.
 *
 * Le `GET` répond du premier coup dans ces tests — le cycle de sondage est éprouvé par
 * `assistant.test.ts`, qui n'a pas besoin d'un navigateur pour cela.
 */
function scripted(responses: { post?: unknown; get?: unknown }) {
  const paths: string[] = [];
  const bodies: unknown[] = [];

  const api = (async (path: string, options?: { method?: string; body?: unknown }) => {
    paths.push(path);
    if (options?.method === 'POST') {
      bodies.push(options.body);
      const post = responses.post ?? { id: 'gen-1', status: 'queued' };
      if (post instanceof Error) throw post;
      return post;
    }
    const get = responses.get ?? { id: 'gen-1', status: 'running' };
    if (get instanceof Error) throw get;
    return get;
  }) as unknown as ApiClient;

  return { api, paths, bodies };
}

const describeField = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const interpret = () =>
  screen.getByRole('button', { name: /Interpréter/u }) as HTMLButtonElement;

async function submit(text = 'une bibliothèque de 1800 sur 2000') {
  fireEvent.change(describeField(), { target: { value: text } });
  fireEvent.click(interpret());
}

beforeEach(cleanup);

describe('soumettre une description', () => {
  it('envoie le texte, débarrassé de ses espaces', async () => {
    const { api, bodies } = scripted({});
    renderWithProviders(<Assistant onUse={() => {}} />, { api });

    await submit('   une bibliothèque de 1800   ');

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ text: 'une bibliothèque de 1800' });
  });

  it('refuse de partir sur deux caractères', () => {
    const { api } = scripted({});
    renderWithProviders(<Assistant onUse={() => {}} />, { api });

    fireEvent.change(describeField(), { target: { value: 'ab' } });

    // Une génération se paie : l'empêcher coûte moins que la facturer pour rien.
    expect(interpret().disabled).toBe(true);
  });

  it('enchaîne sur la relecture', async () => {
    const { api, paths } = scripted({
      get: { id: 'gen-1', status: 'succeeded', model: MODEL },
    });
    renderWithProviders(<Assistant onUse={() => {}} />, { api });

    await submit();

    await waitFor(() => expect(paths).toContain('/v1/assistant/interpretations/gen-1'));
  });
});

describe('ce qui est proposé', () => {
  it('montre les cotes avant que rien n’existe', async () => {
    const used = vi.fn();
    const { api } = scripted({
      get: { id: 'gen-1', status: 'succeeded', model: MODEL },
    });
    renderWithProviders(<Assistant onUse={used} />, { api });

    await submit();

    // Les cotes en clair : une interprétation plausible et fausse ne se voit qu'ainsi.
    await waitFor(() => expect(screen.getByText('1800 × 2000 × 400')).toBeTruthy());
    // **Rien n'est créé** tant que personne n'a cliqué.
    expect(used).not.toHaveBeenCalled();
  });

  it('ne crée le projet que sur un clic', async () => {
    const used = vi.fn();
    const { api } = scripted({
      get: { id: 'gen-1', status: 'succeeded', model: MODEL },
    });
    renderWithProviders(<Assistant onUse={used} />, { api });

    await submit();
    await waitFor(() => screen.getByRole('button', { name: /Créer ce projet/u }));
    fireEvent.click(screen.getByRole('button', { name: /Créer ce projet/u }));

    expect(used).toHaveBeenCalledTimes(1);
    expect(used.mock.calls[0]?.[0]).toMatchObject({
      dimensions: { widthMm: 1800, heightMm: 2000, depthMm: 400 },
    });
  });
});

describe('une sortie inexploitable', () => {
  it('nomme le champ en faute plutôt que de dire « erreur »', async () => {
    const { api } = scripted({
      get: {
        id: 'gen-1',
        status: 'unusable',
        model: null,
        problems: { heightMm: ['Cote hors de ce qu’un meuble peut mesurer : 2 mm.'] },
      },
    });
    renderWithProviders(<Assistant onUse={() => {}} />, { api });

    await submit();

    // « Données invalides » obligerait à deviner lequel des trois.
    await waitFor(() => expect(screen.getByText('heightMm')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Créer ce projet/u })).toBeNull();
  });

  it('laisse reformuler', async () => {
    const { api } = scripted({
      get: {
        id: 'gen-1',
        status: 'unusable',
        model: null,
        problems: { widthMm: ['absente'] },
      },
    });
    renderWithProviders(<Assistant onUse={() => {}} />, { api });

    await submit();

    // Le champ se rouvre : l'écran ne doit pas être un cul-de-sac.
    await waitFor(() => expect(describeField().disabled).toBe(false));
  });
});

describe('depuis une photo', () => {
  // `SegmentedControl` rend des onglets, pas des boutons.
  const photo = () => screen.getByRole('tab', { name: /Depuis une photo/u });

  it('offre les cotes, sans les exiger', async () => {
    const { api } = scripted({});
    renderWithProviders(<Assistant onUse={() => {}} />, { api });

    fireEvent.click(photo());

    // Les deux champs existent — qui connaît ses cotes les donne — mais l'image seule
    // suffit : les cotes sont proposées et relues avant qu'aucun projet n'existe.
    expect(screen.getByLabelText(/Largeur hors-tout/u)).toBeTruthy();
    expect(screen.getByLabelText(/Profondeur/u)).toBeTruthy();
    expect(interpret().disabled).toBe(true);
  });

  it('part avec la seule image, sans aucune cote', async () => {
    const { api, bodies } = scripted({
      post: { id: 'gen-1', status: 'succeeded', model: MODEL, problems: null },
      get: { id: 'gen-1', status: 'succeeded', model: MODEL, problems: null },
    });
    renderWithProviders(<Assistant onUse={() => {}} />, { api });

    fireEvent.click(photo());
    fireEvent.change(screen.getByLabelText(/La photo du meuble/u), {
      target: {
        files: [new File([new Uint8Array([1])], 'meuble.png', { type: 'image/png' })],
      },
    });

    await waitFor(() => expect(interpret().disabled).toBe(false));
    fireEvent.click(interpret());

    await waitFor(() => expect(bodies).toHaveLength(1));
    const sent = bodies[0] as Record<string, unknown>;
    // Aucune cote envoyée : ni largeur, ni profondeur.
    expect(sent).not.toHaveProperty('widthMm');
    expect(sent).not.toHaveProperty('depthMm');
  });

  it('refuse une cote hors de ce qu’un meuble mesure', async () => {
    const { api } = scripted({});
    renderWithProviders(<Assistant onUse={() => {}} />, { api });

    fireEvent.click(photo());
    fireEvent.change(screen.getByLabelText(/La photo du meuble/u), {
      target: {
        files: [new File([new Uint8Array([1])], 'meuble.png', { type: 'image/png' })],
      },
    });
    await waitFor(() => expect(interpret().disabled).toBe(false));

    fireEvent.change(screen.getByLabelText(/Largeur hors-tout/u), {
      target: { value: '40000' },
    });

    // Vide, la cote est proposée ; saisie, elle doit tenir — envoyer hors bornes ferait
    // payer un appel pour un refus.
    expect(interpret().disabled).toBe(true);
  });

  it('refuse une photo trop lourde sans rien envoyer', async () => {
    const { api, bodies } = scripted({});
    renderWithProviders(<Assistant onUse={() => {}} />, { api });

    fireEvent.click(photo());

    const heavy = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'catalogue.png', {
      type: 'image/png',
    });
    fireEvent.change(screen.getByLabelText(/La photo du meuble/u), {
      target: { files: [heavy] },
    });

    await waitFor(() => expect(screen.getByText(/trop lourde/u)).toBeTruthy());
    // La borne du serveur, vérifiée ici : inutile de payer un aller-retour pour un 422.
    expect(bodies).toHaveLength(0);
  });

  it('envoie l’image et la largeur, et montre les cotes déduites', async () => {
    const { api, bodies } = scripted({
      post: { id: 'gen-1', status: 'succeeded', model: MODEL, problems: null },
      get: { id: 'gen-1', status: 'succeeded', model: MODEL, problems: null },
    });
    renderWithProviders(<Assistant onUse={() => {}} />, { api });

    fireEvent.click(photo());

    const file = new File([new Uint8Array([1, 2, 3])], 'meuble.png', {
      type: 'image/png',
    });
    fireEvent.change(screen.getByLabelText(/La photo du meuble/u), {
      target: { files: [file] },
    });
    fireEvent.change(screen.getByLabelText(/Largeur hors-tout/u), {
      target: { value: '1800' },
    });

    await waitFor(() => expect(interpret().disabled).toBe(false));
    fireEvent.click(interpret());

    await waitFor(() => expect(bodies).toHaveLength(1));
    const sent = bodies[0] as { image: string; widthMm: number };
    expect(sent.widthMm).toBe(1800);
    expect(sent.image.startsWith('data:image/png;base64,')).toBe(true);

    // Et les cotes s'affichent avant que rien ne soit créé, comme pour une description.
    await waitFor(() => expect(screen.getByText('1800 × 2000 × 400')).toBeTruthy());
  });
});

describe('une installation sans assistant', () => {
  it('se retire au lieu d’inviter à réessayer', async () => {
    const { api } = scripted({
      post: new ApiRequestError(
        503,
        {
          code: 'SERVICE_UNAVAILABLE',
          message: "L'assistant n'est pas configuré sur cette installation.",
        },
        null,
      ),
    });
    renderWithProviders(<Assistant onUse={() => {}} />, { api });

    await submit();

    await waitFor(() =>
      expect(screen.getByText(/n’est pas configuré|n'est pas configuré/u)).toBeTruthy(),
    );
    // Sans clé, rien ne marchera aujourd'hui : laisser le champ ferait réessayer en vain.
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('montre le message de la plateforme pour les autres refus', async () => {
    const { api } = scripted({
      post: new ApiRequestError(
        503,
        {
          code: 'SERVICE_UNAVAILABLE',
          message: "Le quota d'IA de votre abonnement est épuisé.",
        },
        null,
      ),
    });
    renderWithProviders(<Assistant onUse={() => {}} />, { api });

    await submit();

    // Le réécrire ici ferait dire deux choses différentes de la même cause.
    await waitFor(() => expect(screen.getByText(/quota/u)).toBeTruthy());
  });
});
