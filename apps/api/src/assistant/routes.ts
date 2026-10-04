import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { success } from '@neftya/contracts';
import {
  forbidden,
  notFound,
  serviceUnavailable,
  validationFailed,
  type HttpError,
} from '../http/errors.js';
import { sekuuOf } from '../sekuu/authenticate.js';
import { can } from '../sekuu/permission-resolver.js';
import { AiUnavailable } from '../sekuu/ai.js';
import type { AiService } from '../ai/ai-service.js';
import {
  EXTRACTED_FIELDS,
  MAX_DESCRIPTION_LENGTH,
  interpret,
  type Problems,
} from './interpretation.js';

/**
 * Décrire un meuble en une phrase, et obtenir une configuration.
 *
 * Deux routes, parce que la tâche n'est pas synchrone : on soumet, on interroge. Le
 * navigateur revient, comme sur l'écran de paiement du portail.
 *
 * **Rien n'est enregistré.** Une interprétation n'est pas un projet : elle est proposée, et
 * c'est l'utilisateur qui décide d'en faire un. Garder la trace de ce qu'on a refusé de
 * composer n'aiderait personne et créerait une table de brouillons que rien ne nettoie.
 *
 * @see docs/SEKUU.md
 */

const describeBody = z.object({
  text: z
    .string()
    .trim()
    .min(3, 'Décrivez le meuble en quelques mots.')
    // Le coût est proportionnel à l'entrée. Un produit qui envoie un document entier là où
    // trois lignes suffisent paie la différence à chaque appel.
    .max(
      MAX_DESCRIPTION_LENGTH,
      `Description trop longue : ${MAX_DESCRIPTION_LENGTH} caractères au plus.`,
    ),
});

export function registerAssistantRoutes(app: FastifyInstance, ai?: AiService): void {
  app.post('/v1/assistant/interpretations', async (request, reply) => {
    const context = sekuuOf(request);

    // Composer un meuble est le chemin d'écriture : qui ne peut pas créer de projet n'a
    // aucune raison de pouvoir en faire rédiger un.
    if (!can(context, 'project.write')) {
      throw forbidden("Votre rôle ne permet pas d'utiliser l'assistant.");
    }

    const service = configured(ai);
    const body = describeBody.safeParse(request.body);
    if (!body.success) throw details(body.error.issues);

    const text = body.data.text;

    const generation = await guarded(() =>
      service.extract({
        organizationId: context.organizationId,
        input: text,
        fields: EXTRACTED_FIELDS,
        /*
         * L'événement métier est **le texte**, dans cette organisation.
         *
         * Deux fois la même description ne doit pas être facturée deux fois : c'est la même
         * question, et elle a déjà sa réponse. Changer un mot en redemande une.
         */
        idempotencyKey: `neftya:interpret:${context.organizationId}:${digest(text)}`,
      }),
    );

    // `202` et non `200` : l'extraction est acceptée, pas faite.
    return reply.status(202).send(success(pending(generation.id, generation.status)));
  });

  app.get('/v1/assistant/interpretations/:id', async (request) => {
    const context = sekuuOf(request);
    if (!can(context, 'project.write')) {
      throw forbidden("Votre rôle ne permet pas d'utiliser l'assistant.");
    }

    const service = configured(ai);
    const { id } = request.params as { id: string };

    const generation = await guarded(() => service.read(context.organizationId, id));

    if (generation.status !== 'succeeded') {
      return success(pending(generation.id, generation.status));
    }

    const interpretation = interpret(generation.output ?? {});

    /*
     * Un refus de composition n'est **pas** une erreur HTTP.
     *
     * La génération a réussi, elle a coûté, et son résultat est lisible : dire `422` ferait
     * croire à un appel mal formé, alors que c'est la phrase de l'utilisateur qui ne disait
     * pas de quoi faire un meuble. Il doit la reformuler, pas réessayer.
     */
    return success({
      id: generation.id,
      status: interpretation.ok ? 'succeeded' : 'unusable',
      model: interpretation.ok ? interpretation.model : null,
      problems: interpretation.ok ? null : interpretation.problems,
    });
  });
}

function pending(id: string, status: string) {
  return { id, status, model: null, problems: null };
}

/**
 * Sans modèle configuré, l'assistant n'existe pas — et le dit.
 *
 * Storage peut manquer sans empêcher un export : le PDF est produit, il n'est simplement pas
 * déposé. Ici il n'y a rien à dégrader — sans modèle, il n'y a pas d'interprétation.
 * Un `503` nommé vaut mieux qu'un `500` qui ferait chercher un défaut dans Neftya.
 */
function configured(ai?: AiService): AiService {
  if (!ai) {
    throw serviceUnavailable("L'assistant n'est pas configuré sur cette installation.");
  }
  return ai;
}

/** Traduit les refus de la plateforme, en gardant la distinction qui compte. */
async function guarded<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!(error instanceof AiUnavailable)) throw error;

    if (error.refusal === 'not_found') throw notFound('Interprétation introuvable.');

    throw serviceUnavailable(
      {
        // Le seul des quatre qu'un changement de plan résout. Les autres non, et le
        // suggérer serait mensonger.
        quota: "Le quota d'IA de votre abonnement est épuisé.",
        spend_cap: "L'assistant est momentanément indisponible.",
        denied: "L'assistant n'est pas autorisé sur cette installation.",
        unavailable: "L'assistant est momentanément indisponible.",
      }[error.refusal],
    );
  }
}

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32);
}

function details(
  issues: readonly { path: readonly (string | number | symbol)[]; message: string }[],
): HttpError {
  const problems: Problems = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || '_';
    (problems[key] ??= []).push(issue.message);
  }
  return validationFailed(problems);
}
