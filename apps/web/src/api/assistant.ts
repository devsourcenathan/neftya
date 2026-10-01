import type { ParsedFurnitureInput } from '@neftya/engine';
import type { ApiClient } from './client.js';

/**
 * L'assistant : une description, une configuration.
 *
 * Deux appels, parce que la tâche n'est pas synchrone côté plateforme. Le navigateur
 * revient, et c'est le bon endroit pour attendre : le serveur, lui, tiendrait un processus
 * pendant que le modèle réfléchit.
 *
 * @see apps/api/src/assistant/routes.ts
 * @see docs/SEKUU.md §8.1
 */

/**
 * `unusable` n'est **pas** une erreur.
 *
 * La génération a réussi, elle a coûté, et son résultat est lisible : la phrase ne disait
 * simplement pas de quoi faire un meuble. Il faut la reformuler, pas réessayer — et c'est
 * pour cela que ce n'est pas un état d'échec HTTP.
 */
export type InterpretationStatus =
  'queued' | 'running' | 'succeeded' | 'unusable' | 'failed' | 'cancelled';

export interface InterpretationResource {
  id: string;
  status: InterpretationStatus;
  /** Présent uniquement sur `succeeded`. */
  model: ParsedFurnitureInput | null;
  /** Présent uniquement sur `unusable` : les problèmes, par champ. */
  problems: Record<string, string[]> | null;
}

export const interpretDescription = (api: ApiClient, text: string) =>
  api<InterpretationResource>('/v1/assistant/interpretations', {
    method: 'POST',
    body: { text },
  });

export const readInterpretation = (api: ApiClient, id: string) =>
  api<InterpretationResource>(`/v1/assistant/interpretations/${id}`);

/** Entre deux sondages. Assez court pour ne pas se faire attendre, assez long pour ne pas marteler. */
export const POLL_INTERVAL_MS = 1_500;

/**
 * Combien de fois on redemande avant de renoncer.
 *
 * Vingt sondages à 1,5 s font trente secondes. Au-delà, quelque chose ne va pas, et
 * continuer indéfiniment laisserait un onglet interroger la plateforme toute la journée —
 * ce que personne ne verrait et que tout le monde paierait.
 */
export const MAX_POLLS = 20;

/**
 * Faut-il redemander, et dans combien de temps ?
 *
 * Extraite du composant parce que c'est la seule logique du cycle : un `refetchInterval`
 * écrit en place serait vrai le jour où on l'écrit et faux au premier état ajouté.
 */
export function nextPoll(
  status: InterpretationStatus | undefined,
  polls: number,
): number | false {
  // Rien n'est encore parti : il n'y a rien à redemander.
  if (status === undefined) return false;

  // `unusable` est terminal au même titre que `succeeded` : la génération est finie, et la
  // redemander ne la rendra pas meilleure — elle coûterait un appel de plus pour rien.
  if (status !== 'queued' && status !== 'running') return false;

  if (polls >= MAX_POLLS) return false;

  return POLL_INTERVAL_MS;
}

/** A-t-on renoncé, plutôt qu'obtenu une réponse ? */
export function gaveUp(
  status: InterpretationStatus | undefined,
  polls: number,
): boolean {
  return (status === 'queued' || status === 'running') && polls >= MAX_POLLS;
}
