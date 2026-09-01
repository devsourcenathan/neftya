import type { ApiError, ApiResponse } from '@neftya/contracts';

/**
 * Le client de l'API Neftya.
 *
 * Il connaît l'enveloppe de la plateforme et rend `data` ; l'appelant ne déballe jamais
 * `{ success, data, error }` lui-même. Une erreur devient une exception qui porte le code
 * — le composant décide quoi en faire, il ne réinterprète pas un statut HTTP.
 */

const API_URL = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly error: ApiError,
    readonly requestId: string | null,
  ) {
    super(error.message);
    this.name = 'ApiRequestError';
  }

  get code(): ApiError['code'] {
    return this.error.code;
  }

  /** Les messages par champ, quand l'API en fournit. Vide sinon, jamais `undefined`. */
  get details(): Record<string, string[]> {
    return this.error.details ?? {};
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/** Fabrique un client lié à une source de jeton — celle de `useSession`. */
export function createApiClient(token: () => Promise<string>) {
  return async function request<T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        authorization: `Bearer ${await token()}`,
        accept: 'application/json',
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    });

    // 204 : une suppression réussie n'a pas de corps.
    if (response.status === 204) return undefined as T;

    const payload = (await response.json()) as ApiResponse<T>;

    if (!response.ok || !payload.success) {
      const error = payload.success
        ? { code: 'INTERNAL_ERROR' as const, message: 'Réponse inattendue du serveur.' }
        : payload.error;

      throw new ApiRequestError(
        response.status,
        error,
        payload.meta?.request_id ?? null,
      );
    }

    return payload.data;
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * Télécharge un fichier de l'API.
 *
 * **Un lien de navigateur ne porte pas d'en-tête.** Un simple `<a href>` vers une route
 * authentifiée rend un `401` et affiche le JSON d'erreur à la place du fichier — c'est
 * exactement ce que faisaient les deux boutons de téléchargement.
 *
 * Le fichier est donc récupéré par `fetch`, avec le jeton, puis remis au navigateur sous
 * forme d'URL d'objet. L'autre solution — une URL signée à usage unique — demanderait une
 * route de plus et un secret de plus, pour un téléchargement déclenché par un clic dans une
 * page déjà authentifiée.
 */
export function createFileClient(token: () => Promise<string>) {
  return async function download(path: string, filename: string): Promise<void> {
    const response = await fetch(`${API_URL}${path}`, {
      headers: { authorization: `Bearer ${await token()}` },
    });

    if (!response.ok) {
      // Le corps est l'enveloppe de la plateforme, même sur une route qui rend un fichier.
      const payload = (await response
        .json()
        .catch(() => null)) as ApiResponse<never> | null;

      throw new ApiRequestError(
        response.status,
        payload && !payload.success
          ? payload.error
          : { code: 'INTERNAL_ERROR', message: 'Téléchargement impossible.' },
        payload?.meta?.request_id ?? null,
      );
    }

    saveBlob(await response.blob(), filename);
  };
}

export type FileClient = ReturnType<typeof createFileClient>;

/**
 * Remet un contenu au navigateur sous le nom voulu.
 *
 * L'URL d'objet est **relâchée** après usage : chacune retient son contenu en mémoire
 * jusqu'à ce qu'on la révoque, et un onglet laissé ouvert une journée finirait par les
 * accumuler.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}
