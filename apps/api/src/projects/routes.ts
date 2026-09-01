import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { success } from '@neftya/contracts';
import { build, cutList, furnitureInput } from '@neftya/engine';
import { forbidden, notFound, validationFailed } from '../http/errors.js';
import { sekuuOf } from '../sekuu/authenticate.js';
import { can } from '../sekuu/permission-resolver.js';
import { enforceLimit } from '../sekuu/quota.js';
import type { Project, ProjectRepository } from './repository.js';

/**
 * Les projets.
 *
 * Le corps de requête ne porte **que** le nom et le modèle paramétrique. Ni la liste de
 * pièces, ni le plan de découpe, ni le coût : tout cela est recalculé par le moteur à
 * partir du modèle, à chaque lecture. Accepter du dérivé, c'est accepter qu'un client
 * envoie une liste de découpe qui ne correspond pas au meuble — et c'est cette liste-là
 * qui partirait à l'atelier.
 *
 * @see docs/ENGINEERING.md §6
 */

const createBody = z.object({
  name: z.string().trim().min(1).max(120),
  model: furnitureInput,
});

const updateBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    model: furnitureInput.optional(),
  })
  .refine((body) => body.name !== undefined || body.model !== undefined, {
    message: 'Aucune modification fournie.',
  });

const identifier = z.object({ id: z.uuid() });

export const PROJECTS_LIMIT_KEY = 'neftya_projects_max';

export function registerProjectRoutes(
  app: FastifyInstance,
  repository: ProjectRepository,
): void {
  app.get('/v1/projects', async (request) => {
    const context = sekuuOf(request);
    requirePermission(request, 'project.read');

    const projects = await repository.list(context.organizationId);
    return success(projects.map(toResource));
  });

  app.get('/v1/projects/:id', async (request) => {
    const context = sekuuOf(request);
    requirePermission(request, 'project.read');

    const project = await repository.find(context.organizationId, parseId(request));
    if (!project) throw notFound('Projet introuvable.');

    return success(toResource(project));
  });

  // Le meuble calculé, jamais stocké. La même fonction pure tourne dans le navigateur
  // pendant l'édition ; ici, elle fait foi.
  app.get('/v1/projects/:id/build', async (request) => {
    const context = sekuuOf(request);
    requirePermission(request, 'project.read');

    const project = await repository.find(context.organizationId, parseId(request));
    if (!project) throw notFound('Projet introuvable.');

    const furniture = build(project.model);
    return success({ furniture, cutList: cutList(furniture) });
  });

  app.post('/v1/projects', async (request, reply) => {
    const context = sekuuOf(request);
    requirePermission(request, 'project.write');

    const body = parse(createBody, request.body);

    await enforceLimit(
      context,
      PROJECTS_LIMIT_KEY,
      () => repository.countActive(context.organizationId),
      'Le nombre de projets de votre abonnement est atteint.',
    );

    const project = await repository.create({
      organizationId: context.organizationId,
      createdBy: context.userId,
      name: body.name,
      model: body.model,
    });

    return reply.status(201).send(success(toResource(project)));
  });

  app.patch('/v1/projects/:id', async (request) => {
    const context = sekuuOf(request);
    requirePermission(request, 'project.write');

    const body = parse(updateBody, request.body);
    const project = await repository.update(context.organizationId, parseId(request), {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.model !== undefined ? { model: body.model } : {}),
    });
    if (!project) throw notFound('Projet introuvable.');

    return success(toResource(project));
  });

  app.delete('/v1/projects/:id', async (request, reply) => {
    const context = sekuuOf(request);
    requirePermission(request, 'project.delete');

    const deleted = await repository.softDelete(
      context.organizationId,
      parseId(request),
    );
    if (!deleted) throw notFound('Projet introuvable.');

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

/**
 * Un identifiant mal formé est un `404`, pas un `422` : répondre différemment selon que
 * l'identifiant est syntaxiquement valide ou non redonne l'oracle qu'on vient de fermer.
 */
function parseId(request: FastifyRequest): string {
  const params = identifier.safeParse(request.params);
  if (!params.success) throw notFound('Projet introuvable.');
  return params.data.id;
}

function parse<T extends z.ZodType>(schema: T, payload: unknown): z.infer<T> {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;

  const details: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    (details[key] ??= []).push(issue.message);
  }
  throw validationFailed(details);
}

/**
 * L'état d'avancement d'un projet, **déduit et non saisi**.
 *
 * Un statut qu'on choisit dans une liste déroulante ment dès le lendemain : personne ne
 * revient le corriger. Celui-ci se lit des données à chaque appel, et il ne peut donc pas
 * diverger de ce que le projet est vraiment.
 *
 *  - `needs_review` : le moteur signale quelque chose — une flèche d'étagère, un vantail
 *    trop large, un tiroir qui ne rentre pas. Cela prime sur le reste : un plan parti à
 *    l'atelier avec un avertissement reste un plan à relire.
 *  - `ready` : un export a été figé. C'est la seule trace qu'un plan est parti.
 *  - `draft` : tout le reste.
 *
 * Il n'y a **pas** d'état « optimisé » : le plan de découpe est recalculé à chaque appel,
 * il l'est donc toujours, et l'annoncer comme une étape franchie ne dirait rien.
 */
export type ProjectStatus = 'draft' | 'needs_review' | 'ready';

function statusOf(project: Project): ProjectStatus {
  if (build(project.model).warnings.length > 0) return 'needs_review';
  return project.exportCount > 0 ? 'ready' : 'draft';
}

function toResource(project: Project) {
  return {
    id: project.id,
    name: project.name,
    model: project.model,
    status: statusOf(project),
    export_count: project.exportCount,
    created_by: project.createdBy,
    created_at: project.createdAt.toISOString(),
    updated_at: project.updatedAt.toISOString(),
  };
}
