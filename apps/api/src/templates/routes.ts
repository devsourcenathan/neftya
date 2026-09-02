import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { localisedName, resolveName, success } from '@neftya/contracts';
import { furnitureInput } from '@neftya/engine';
import { conflict, forbidden, notFound, validationFailed } from '../http/errors.js';
import { sekuuOf } from '../sekuu/authenticate.js';
import { can } from '../sekuu/permission-resolver.js';
import { CATALOGUE } from './catalogue.js';
import type { TemplateRepository } from './repository.js';

/**
 * Les modèles : ceux de Neftya, et ceux de l'organisation.
 *
 * Les deux arrivent dans **une seule liste**, avec la même forme et le même nom résolu. Un
 * client qui devrait fusionner deux sources finirait par les afficher différemment, et le
 * modèle d'une organisation aurait l'air d'un citoyen de seconde classe dans son propre
 * produit.
 *
 * @see docs/I18N.md §6
 */

const identifier = z.object({ id: z.uuid() });

const createBody = z.object({
  name: localisedName,
  model: furnitureInput,
});

/**
 * Un plafond franc, non négociable par l'interface.
 *
 * Ce n'est pas un quota de plan — Billing n'en publie pas pour les modèles — mais une
 * borne technique : une liste de modèles est un menu, et un menu de deux cents entrées
 * n'est plus un menu.
 */
export const TEMPLATES_MAX = 50;

export function registerTemplateRoutes(
  app: FastifyInstance,
  templates: TemplateRepository,
): void {
  app.get('/v1/templates', async (request) => {
    const context = sekuuOf(request);
    requirePermission(request, 'project.read');

    const owned = await templates.list(context.organizationId);

    return success([
      // Le catalogue d'abord : c'est le point d'entrée de qui n'a rien créé.
      ...CATALOGUE.map((template) => ({
        id: `catalogue:${template.slug}`,
        source: 'catalogue' as const,
        // Le nom est résolu **ici**, à la langue du jeton : c'est la plateforme qui la
        // porte, et le serveur est le seul à la connaître avec certitude.
        name: resolveName(template.name, context.language),
        name_translations: template.name,
        model: template.model,
      })),
      ...owned.map((template) => ({
        id: template.id,
        source: 'organization' as const,
        name: resolveName(template.name, context.language),
        name_translations: template.name,
        model: template.model,
      })),
    ]);
  });

  app.post('/v1/templates', async (request, reply) => {
    const context = sekuuOf(request);
    requirePermission(request, 'project.write');

    const body = parse(createBody, request.body);

    if ((await templates.count(context.organizationId)) >= TEMPLATES_MAX) {
      throw conflict(`Vous ne pouvez pas dépasser ${TEMPLATES_MAX} modèles.`);
    }

    const template = await templates.create({
      organizationId: context.organizationId,
      createdBy: context.userId,
      name: body.name,
      model: body.model,
    });

    return reply.status(201).send(
      success({
        id: template.id,
        source: 'organization' as const,
        name: resolveName(template.name, context.language),
        name_translations: template.name,
        model: template.model,
      }),
    );
  });

  app.delete('/v1/templates/:id', async (request, reply) => {
    const context = sekuuOf(request);
    requirePermission(request, 'project.delete');

    // Un modèle du catalogue n'a pas d'identifiant en base : sa suppression est un `404`,
    // exactement comme celle d'un modèle inexistant. Le catalogue appartient au produit,
    // pas à l'organisation.
    const deleted = await templates.softDelete(
      context.organizationId,
      parseId(request),
    );
    if (!deleted) throw notFound('Modèle introuvable.');

    return reply.status(204).send();
  });
}

function requirePermission(
  request: FastifyRequest,
  permission: Parameters<typeof can>[1],
): void {
  if (!can(sekuuOf(request), permission)) {
    throw forbidden('Votre rôle ne permet pas cette action.');
  }
}

function parseId(request: FastifyRequest): string {
  const params = identifier.safeParse(request.params);
  if (!params.success) throw notFound('Modèle introuvable.');
  return params.data.id;
}

function parse<T extends z.ZodType>(schema: T, payload: unknown): z.infer<T> {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;

  const details: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    (details[issue.path.join('.') || '_'] ??= []).push(issue.message);
  }
  throw validationFailed(details);
}
