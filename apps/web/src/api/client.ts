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
