import { z } from 'zod';

/**
 * L'enveloppe de réponse est celle de Sekuu Platform, pas une invention de Neftya.
 *
 * @see Sekuu-Platform/docs/02-standards/error-codes.md
 * @see docs/ENGINEERING.md §1
 */

export const errorCode = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
]);

export type ErrorCode = z.infer<typeof errorCode>;

export const apiError = z.object({
  code: errorCode,
  message: z.string(),
  /** Présent seulement quand il apporte une information exploitable par le client. */
  details: z.record(z.string(), z.array(z.string())).optional(),
});

export type ApiError = z.infer<typeof apiError>;

export interface ApiMeta {
  request_id: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiFailure {
  success: false;
  error: ApiError;
  meta?: ApiMeta;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function success<T>(data: T, meta?: ApiMeta): ApiSuccess<T> {
  return meta ? { success: true, data, meta } : { success: true, data };
}

export function failure(error: ApiError, meta?: ApiMeta): ApiFailure {
  return meta ? { success: false, error, meta } : { success: false, error };
}

/** Statut HTTP correspondant à chaque code, pour que l'API ne les désaccorde jamais. */
export const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};
