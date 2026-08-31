import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { success } from '@neftya/contracts';
import { forbidden, validationFailed } from '../http/errors.js';
import { sekuuOf } from '../sekuu/authenticate.js';
import { can } from '../sekuu/permission-resolver.js';
import type { SettingsRepository } from './repository.js';

/**
 * `null` est une valeur acceptée, et c'est le point : elle rend le réglage à la
 * plateforme. Sans elle, un client ayant une fois choisi un pays ne pourrait plus revenir
 * à « comme chez Sekuu ».
 */
const settingsBody = z
  .object({
    country: z
      .string()
      .regex(/^[A-Z]{2}$/, 'Code pays ISO 3166-1 alpha-2 attendu.')
      .nullable()
      .optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'Code devise ISO 4217 attendu.')
      .nullable()
      .optional(),
    unit_system: z.enum(['metric', 'imperial']).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Aucune modification fournie.',
  });

export function registerSettingsRoutes(
  app: FastifyInstance,
  repository: SettingsRepository,
): void {
  app.get('/v1/settings', async (request) => {
    const context = sekuuOf(request);
    return success(toResource(await repository.get(context.organizationId)));
  });

  app.put('/v1/settings', async (request) => {
    const context = sekuuOf(request);
    if (!can(context, 'settings.write')) {
      throw forbidden('Votre rôle ne permet pas de modifier les réglages.');
    }

    const result = settingsBody.safeParse(request.body);
    if (!result.success) {
      const details: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        (details[key] ??= []).push(issue.message);
      }
      throw validationFailed(details);
    }

    const { unit_system: unitSystem, country, currency } = result.data;
    const settings = await repository.save(context.organizationId, {
      ...(country !== undefined ? { country } : {}),
      ...(currency !== undefined ? { currency } : {}),
      ...(unitSystem !== undefined ? { unitSystem } : {}),
    });

    return success(toResource(settings));
  });
}

function toResource(settings: {
  country: string | null;
  currency: string | null;
  unitSystem: string;
}) {
  return {
    country: settings.country,
    currency: settings.currency,
    unit_system: settings.unitSystem,
  };
}
