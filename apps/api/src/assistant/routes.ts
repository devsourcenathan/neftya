import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { success } from '@neftya/contracts';
import {
  conflict,
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

    /*
     * `202` seulement s'il reste quelque chose à attendre.
     *
     * Le contrat à deux temps tient toujours — l'appelant peut sonder — mais il n'a plus à
     * le faire pour rien : une extraction synchrone répond déjà `succeeded`, et annoncer
     * `202` sur une réponse complète ferait sonder une génération terminée.
     */
    return reply
      .status(settled(generation.status) ? 200 : 202)
      .send(success(resource(generation)));
  });

  app.get('/v1/assistant/interpretations/:id', async (request) => {
    const context = sekuuOf(request);
    if (!can(context, 'project.write')) {
      throw forbidden("Votre rôle ne permet pas d'utiliser l'assistant.");
    }

    const service = configured(ai);
    const { id } = request.params as { id: string };

    const generation = await guarded(() => service.read(context.organizationId, id));

    return success(resource(generation));
  });
}

/** Reste-t-il quelque chose à attendre ? */
function settled(status: string): boolean {
  return status !== 'queued' && status !== 'running';
}

/**
 * Une interprétation, telle qu'elle se rend — **le même objet aux deux routes**.
 *
 * Il y avait ici deux sérialisations : le `POST` rendait toujours `model: null`, le `GET`
 * composait. C'était cohérent tant que l'extraction était asynchrone, puisque le `POST`
 * répondait `queued`. Depuis qu'elle est synchrone, il annonçait `succeeded` les mains
 * vides, et un appelant qui le croyait n'affichait rien.
 *
 * Deux sérialisations d'une même ressource divergent toujours ; une seule ne peut pas.
 *
 * Un refus de composition n'est **pas** une erreur HTTP : la génération a réussi, elle a
 * coûté, et son résultat est lisible. Dire `422` ferait croire à un appel mal formé, alors
 * que c'est la phrase qui ne disait pas de quoi faire un meuble — il faut la reformuler,
 * pas réessayer.
 */
function resource(generation: { id: string; status: string; output: unknown }) {
  if (generation.status !== 'succeeded') {
    return {
      id: generation.id,
      status: generation.status,
      model: null,
      problems: null,
    };
  }

  const interpretation = interpret(
    (generation.output as Record<string, unknown> | null) ?? {},
  );

  return {
    id: generation.id,
    status: interpretation.ok ? 'succeeded' : 'unusable',
    model: interpretation.ok ? interpretation.model : null,
    problems: interpretation.ok ? null : interpretation.problems,
  };
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

    /*
     * Un quota épuisé rend **409**, comme celui des projets.
     *
     * Il rendait `503`. Le message était juste — « votre quota est épuisé » — et le code
     * disait « service indisponible » : l'un invite à relever le plafond, l'autre à
     * attendre. Une interface ne peut pas traiter les deux refus de la même façon si l'API
     * les nomme différemment, et c'est le même refus.
     *
     * Le reste demeure `503` : là, il n'y a rien que le client puisse relever. Le plafond
     * de dépense est celui de l'installation, pas celui de l'abonné — l'inviter à payer
     * plus serait mensonger.
     */
    if (error.refusal === 'quota') {
      throw conflict("Le quota d'IA de votre abonnement est épuisé.");
    }

    throw serviceUnavailable(
      {
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
